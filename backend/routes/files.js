import express from 'express';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { x402Middleware } from '../middleware/x402.js';
import { db } from '../db/client.js';

const router = express.Router();

// Legacy base64 upload removed; uploads handled via /v1/uploads

router.get(
  '/download/:fileId',
  x402Middleware(process.env.DOWNLOAD_PRICE || '0.01'),
  async (req, res) => {
    try {
      const { fileId } = req.params;
      const { password } = req.query;
      const { rows } = await db.query('select * from files where id=$1', [fileId]);
      const file = rows[0];

      if (!file) {
        return res.status(404).json({
          error: 'File not found'
        });
      }

      if (file.status === 'expired') {
        return res.status(410).json({
          error: 'File has expired'
        });
      }

      if (file.expires_at && new Date() > new Date(file.expires_at)) {
        await db.query('update files set status=$1 where id=$2', ['expired', fileId]);
        return res.status(410).json({
          error: 'File has expired'
        });
      }

      if (file.max_downloads && file.download_count >= file.max_downloads) {
        await db.query('update files set status=$1 where id=$2', ['expired', fileId]);
        return res.status(410).json({
          error: 'Maximum download limit reached'
        });
      }

      if (file.encrypted && !password) {
        return res.status(400).json({
          error: 'Password required for encrypted file'
        });
      }

      // No server-side encryption path in S3 mode
      if (file.encrypted) {
        return res.status(401).json({
          error: 'Invalid password'
        });
      }

      await db.query('update files set download_count=download_count+1 where id=$1', [fileId]);

      const fileData = null;

      res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify({
        signature: req.payment.signature,
        amount: req.payment.amount
      }));

      res.json({
        success: true,
        file,
        fileData,
        remainingDownloads: file.max_downloads ? file.max_downloads - (file.download_count + 1) : null
      });

    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({
        error: 'Download failed',
        details: error.message
      });
    }
  }
);

// New: pay-to-view that returns a temporary redirect to the UploadThing URL
router.get(
  '/view/:fileId',
  x402Middleware(process.env.DOWNLOAD_PRICE || '0.01'),
  async (req, res) => {
    try {
      const { fileId } = req.params;
      const { rows } = await db.query('select * from files where id=$1', [fileId]);
      const file = rows[0];
      if (!file) return res.status(404).json({ error: 'File not found' });

      // Enforce expiration
      if (file.status === 'expired') {
        return res.status(410).json({ error: 'File has expired' });
      }
      if (file.expires_at && new Date() > new Date(file.expires_at)) {
        await db.query('update files set status=$1 where id=$2', ['expired', fileId]);
        return res.status(410).json({ error: 'File has expired' });
      }

      // Enforce max downloads (burn on X reads)
      if (file.max_downloads && file.download_count >= file.max_downloads) {
        await db.query('update files set status=$1 where id=$2', ['expired', fileId]);
        return res.status(410).json({ error: 'Maximum download limit reached' });
      }

      const bucket = process.env.S3_BUCKET;
      const region = process.env.S3_REGION;
      const ttl = parseInt(process.env.S3_PRESIGN_DOWNLOAD_TTL_SECONDS || '60', 10);
      if (!bucket || !region || !file.s3_key) {
        return res.status(404).json({ error: 'File storage not available' });
      }

      // Increment download count prior to issuing redirect
      await db.query('update files set download_count=download_count+1 where id=$1', [fileId]);

      // If this view consumes the last allowed read, mark as expired and schedule deletion
      if (file.max_downloads && (Number(file.download_count) + 1) >= Number(file.max_downloads)) {
        const deleteAfter = new Date(Date.now() + ttl * 1000).toISOString();
        await db.query('update files set status=$1, delete_after=$2 where id=$3', ['expired', deleteAfter, fileId]);
      }

      const s3 = new S3Client({ region });
      const command = new GetObjectCommand({ Bucket: bucket, Key: file.s3_key });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: ttl });

      res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify({
        signature: req.payment.signature,
        amount: req.payment.amount
      }));

      // 302 redirect to presigned S3 URL (temporary)
      return res.redirect(302, signedUrl);
    } catch (error) {
      console.error('View error:', error);
      res.status(500).json({ error: 'View failed', details: error.message });
    }
  }
);

router.get('/list', async (req, res) => {
  try {
    const { limit = 50, offset = 0, includeExpired = false, uploader } = req.query;
    const take = parseInt(limit);
    const skip = parseInt(offset);
    const params = [];
    let where = ' where 1=1 ';
    if (!includeExpired) {
      where += ` and status = $${params.length + 1}`;
      params.push('active');
    }
    if (uploader) {
      where += ` and uploader_address = $${params.length + 1}`;
      params.push(String(uploader));
    }
    const listSql = `select id, name, size, type, uploaded_at, expires_at, max_downloads, download_count, status, uploader_address from files ${where} order by uploaded_at desc limit $${params.length + 1} offset $${params.length + 2}`;
    const { rows } = await db.query(listSql, [...params, take, skip]);
    const countSql = `select count(*)::int as c from files ${where}`;
    const { rows: countRows } = await db.query(countSql, params);
    res.json({ success: true, files: rows, total: countRows[0].c, limit: take, offset: skip });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({
      error: 'Failed to list files',
      details: error.message
    });
  }
});

router.delete(
  '/:fileId',
  x402Middleware(process.env.DELETE_PRICE || '0.005'),
  async (req, res) => {
    try {
      const { fileId } = req.params;

      const { rows } = await db.query('select * from files where id=$1', [fileId]);
      const file = rows[0];
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Optionally restrict delete to original payer/uploader
      if (process.env.RESTRICT_DELETE_TO_OWNER === 'true') {
        const payer = req.payment?.payer || null;
        // Enforce only if uploader_address is recorded; otherwise allow (legacy uploads)
        if (file.uploader_address && (!payer || payer !== file.uploader_address)) {
          return res.status(403).json({ error: 'Only the uploader can delete this file' });
        }
      }

      // Best-effort delete from S3
      try {
        const bucket = process.env.S3_BUCKET;
        const region = process.env.S3_REGION;
        if (bucket && region && file.s3_key) {
          const s3 = new S3Client({ region });
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.s3_key }));
        }
      } catch {}

      await db.query('delete from files where id=$1', [fileId]);

      res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify({
        signature: req.payment.signature,
        amount: req.payment.amount
      }));

      res.json({
        success: true,
        message: 'File deleted successfully',
        fileId
      });

    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({
        error: 'Delete failed',
        details: error.message
      });
    }
  }
);

router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    const { rows } = await db.query('select * from files where id=$1', [fileId]);
    const f = rows[0];
    if (!f) {
      return res.status(404).json({ error: 'File not found' });
    }

    const isExpired = f.expires_at && new Date() > new Date(f.expires_at);
    const maxDownloadsReached = f.max_downloads && f.download_count >= f.max_downloads;

    res.json({
      success: true,
      file: {
        id: f.id,
        name: f.name,
        size: f.size != null ? Number(f.size) : null,
        type: f.type,
        uploadedAt: f.uploaded_at,
        expiresAt: f.expires_at,
        maxDownloads: f.max_downloads,
        downloadCount: f.download_count,
        remainingDownloads: f.max_downloads ? Number(f.max_downloads) - Number(f.download_count) : null,
        status: isExpired || maxDownloadsReached ? 'expired' : f.status,
        uploaderAddress: f.uploader_address,
        encrypted: !!f.encrypted,
        encAlgo: f.enc_algo,
        encSalt: f.enc_salt,
        encNonce: f.enc_nonce,
        originalName: f.original_name,
        originalType: f.original_type
      }
    });

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      error: 'Failed to get file',
      details: error.message
    });
  }
});

export { router as fileRouter };
