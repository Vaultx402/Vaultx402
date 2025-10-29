import express from 'express';
import crypto from 'crypto';
import { Keypair } from '@solana/web3.js';
import { x402Middleware } from '../middleware/x402.js';
import { files as filesStore } from './files.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const router = express.Router();

// In-memory stores for simplicity
const uploads = new Map(); // uploadId -> session
const uploadedData = new Map(); // objectKey -> Buffer

const MB = 1024 * 1024;

const clampMaxSizeMB = (requestedMB) => {
  const envMax = parseInt(process.env.MAX_FILE_SIZE || '100', 10);
  const safeRequested = Math.max(1, Math.floor(requestedMB || envMax));
  return Math.min(safeRequested, envMax);
};

const computePriceForCeiling = (maxSizeMB) => {
  // If PRICE_PER_GB provided, prefer it; otherwise derive from PRICE_PER_MB
  const pricePerGB = process.env.PRICE_PER_GB
    ? parseFloat(process.env.PRICE_PER_GB)
    : (parseFloat(process.env.PRICE_PER_MB || '0.01') * 1024);
  const gb = Math.ceil(maxSizeMB / 1024);
  const amount = pricePerGB * (gb || 1);
  return amount.toFixed(2);
};

const createUploadId = () => crypto.randomBytes(16).toString('hex');

router.post('/initiate', async (req, res) => {
  try {
    const { filename, contentType, maxSizeMB } = req.body || {};

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    const cappedMaxMB = clampMaxSizeMB(maxSizeMB);
    const amount = computePriceForCeiling(cappedMaxMB);
    const reference = Keypair.generate().publicKey.toBase58();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const requiredPrice = amount; // in USDC

    // If no payment header present, return x402 challenge
    if (!req.headers['x-payment']) {
      return res.status(402).json({
        chain: 'solana',
        tokenMint: process.env.USDC_MINT,
        amount: requiredPrice,
        recipients: [process.env.SOLANA_WALLET_ADDRESS],
        reference,
        expiresAt
      });
    }

    // Validate payment using existing x402 middleware
    const middleware = x402Middleware(requiredPrice);
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => (err ? reject(err) : resolve()));
    });

    const uploadId = createUploadId();
    const objectKey = `obj_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const uploadExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    uploads.set(uploadId, {
      objectKey,
      filename,
      contentType,
      maxBytes: cappedMaxMB * MB,
      paidAmount: parseFloat(requiredPrice),
      reference,
      paymentSignature: req.payment?.signature,
      createdAt: new Date().toISOString(),
      expiresAt: uploadExpiresAt,
      used: false
    });

    return res.status(200).json({
      method: 'PUT',
      uploadUrl: `/v1/uploads/upload/${uploadId}`,
      objectKey,
      uploadExpiresAt,
      contentType,
      maxBytes: cappedMaxMB * MB,
      checksum: 'sha256-optional',
      paymentSignature: req.payment?.signature || null,
      reference,
      verifyUrl: `/v1/uploads/verify/${objectKey}`,
      fileMetaUrl: `/api/files/${objectKey}`
    });
  } catch (error) {
    console.error('initiate error:', error);
    return res.status(500).json({ error: 'Failed to initiate upload' });
  }
});

router.put('/upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const session = uploads.get(uploadId);

    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    if (session.used) {
      return res.status(409).json({ error: 'Upload already completed for this URL' });
    }

    if (new Date() > new Date(session.expiresAt)) {
      return res.status(410).json({ error: 'Upload URL expired' });
    }

    // Enforce content type if provided
    if (req.headers['content-type'] && session.contentType) {
      const provided = String(req.headers['content-type']).split(';')[0].trim();
      if (provided !== session.contentType) {
        return res.status(415).json({ error: 'Unsupported content type' });
      }
    }

    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (!contentLength || Number.isNaN(contentLength)) {
      return res.status(411).json({ error: 'Content-Length required' });
    }
    if (contentLength > session.maxBytes) {
      return res.status(413).json({ error: 'Payload Too Large' });
    }

    let received = 0;
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        received += chunk.length;
        if (received > session.maxBytes) {
          reject(Object.assign(new Error('Payload Too Large'), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', resolve);
      req.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    if (buffer.length !== contentLength) {
      return res.status(400).json({ error: 'Content length mismatch' });
    }

    // Optional checksum enforcement
    const providedChecksum = req.headers['x-checksum-sha256']
      ? String(req.headers['x-checksum-sha256']).toLowerCase()
      : null;
    const computedChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
    if (providedChecksum && providedChecksum !== computedChecksum) {
      return res.status(400).json({ error: 'Checksum mismatch' });
    }

    // Upload to S3 storage
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    const keyPrefix = process.env.S3_UPLOAD_KEY_PREFIX || 'uploads/';
    if (!bucket || !region) {
      return res.status(500).json({ error: 'S3 not configured' });
    }
    const s3Key = `${keyPrefix}${session.objectKey}/${session.filename}`;

    const s3 = new S3Client({ region });
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: session.contentType
      }));
    } catch (e) {
      console.error('S3 upload failed:', e);
      return res.status(502).json({ error: 'Failed to store file' });
    }

    session.used = true;
    session.actualSize = buffer.length;
    session.completedAt = new Date().toISOString();
    session.checksumSha256 = computedChecksum;
    session.s3Key = s3Key;
    uploads.set(uploadId, session);

    // Create a minimal file record to integrate with existing listing/download
    const fileId = session.objectKey;
    const fileRecord = {
      id: fileId,
      name: session.filename,
      size: buffer.length,
      type: session.contentType,
      uploadedAt: session.completedAt,
      expiresAt: null,
      maxDownloads: null,
      downloadCount: 0,
      paymentSignature: session.paymentSignature,
      pricePaid: session.paidAmount,
      status: 'active',
      encrypted: false,
      checksumSha256: computedChecksum,
      s3Key
    };
    filesStore.set(fileId, fileRecord);

    return res.status(201).json({
      success: true,
      fileId,
      size: buffer.length,
      s3Key
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('upload error:', error);
    return res.status(status).json({ error: error.message || 'Upload failed' });
  }
});

router.get('/verify/:objectKey', async (req, res) => {
  try {
    const { objectKey } = req.params;
    // Find session by objectKey
    let session = null;
    for (const s of uploads.values()) {
      if (s.objectKey === objectKey) { session = s; break; }
    }
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.json({
      objectKey,
      size: session.actualSize || null,
      checksumSha256: session.checksumSha256 || null,
      used: session.used,
      createdAt: session.createdAt,
      completedAt: session.completedAt || null,
      paymentSignature: session.paymentSignature || null,
      utUrl: session.utUrl || null
    });
  } catch (error) {
    console.error('verify error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// Export in-memory stores for potential use elsewhere (e.g., download proxy)
export { router as uploadsRouter, uploads, uploadedData };


