import express from 'express';
import { createRouteHandler } from 'uploadthing/server';
import { uploadRouter } from '../lib/uploadthing.js';
import { x402Middleware } from '../middleware/x402.js';

const router = express.Router();

const files = new Map();

const calculateUploadPrice = (fileSizeBytes) => {
  const pricePerMB = parseFloat(process.env.PRICE_PER_MB || '0.01');
  const fileSizeMB = fileSizeBytes / (1024 * 1024);
  return (fileSizeMB * pricePerMB).toFixed(2);
};

router.post('/upload', async (req, res) => {
  try {
    const { fileName, fileSize, fileType, maxDownloads, expiresIn } = req.body;

    if (!fileName || !fileSize) {
      return res.status(400).json({
        error: 'fileName and fileSize are required'
      });
    }

    const requiredPrice = calculateUploadPrice(fileSize);

    const middleware = x402Middleware(requiredPrice);

    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const now = Date.now();
    const ttlMs = expiresIn ? parseInt(expiresIn) * 1000 : null;
    const expiresAt = ttlMs ? new Date(now + ttlMs).toISOString() : null;

    const fileRecord = {
      id: fileId,
      name: fileName,
      size: fileSize,
      type: fileType,
      uploadedAt: new Date().toISOString(),
      expiresAt,
      maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
      downloadCount: 0,
      paymentSignature: req.payment.signature,
      pricePaid: req.payment.amount,
      status: 'active'
    };

    files.set(fileId, fileRecord);

    res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify({
      signature: req.payment.signature,
      amount: req.payment.amount
    }));

    res.json({
      success: true,
      fileId,
      file: fileRecord
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
});

router.get(
  '/download/:fileId',
  x402Middleware(process.env.DOWNLOAD_PRICE || '0.01'),
  async (req, res) => {
    try {
      const { fileId } = req.params;

      const file = files.get(fileId);

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

      if (file.expiresAt && new Date() > new Date(file.expiresAt)) {
        file.status = 'expired';
        files.set(fileId, file);
        return res.status(410).json({
          error: 'File has expired'
        });
      }

      if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
        file.status = 'expired';
        files.set(fileId, file);
        return res.status(410).json({
          error: 'Maximum download limit reached'
        });
      }

      file.downloadCount++;
      file.lastDownloadedAt = new Date().toISOString();

      if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
        file.status = 'expired';
      }

      files.set(fileId, file);

      res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify({
        signature: req.payment.signature,
        amount: req.payment.amount
      }));

      res.json({
        success: true,
        file,
        remainingDownloads: file.maxDownloads ? file.maxDownloads - file.downloadCount : null
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

router.get('/list', async (req, res) => {
  try {
    const { limit = 50, offset = 0, includeExpired = false } = req.query;

    let fileList = Array.from(files.values());

    if (!includeExpired) {
      fileList = fileList.filter(f => f.status === 'active');
    }

    fileList = fileList
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit))
      .map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        uploadedAt: f.uploadedAt,
        expiresAt: f.expiresAt,
        maxDownloads: f.maxDownloads,
        downloadCount: f.downloadCount,
        status: f.status
      }));

    res.json({
      success: true,
      files: fileList,
      total: files.size,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

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

      const file = files.get(fileId);

      if (!file) {
        return res.status(404).json({
          error: 'File not found'
        });
      }

      files.delete(fileId);

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

    const file = files.get(fileId);

    if (!file) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    const isExpired = file.expiresAt && new Date() > new Date(file.expiresAt);
    const maxDownloadsReached = file.maxDownloads && file.downloadCount >= file.maxDownloads;

    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        expiresAt: file.expiresAt,
        maxDownloads: file.maxDownloads,
        downloadCount: file.downloadCount,
        remainingDownloads: file.maxDownloads ? file.maxDownloads - file.downloadCount : null,
        status: isExpired || maxDownloadsReached ? 'expired' : file.status
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

const cleanupExpiredFiles = () => {
  const now = new Date();
  let cleanedCount = 0;

  for (const [fileId, file] of files.entries()) {
    const isExpired = file.expiresAt && now > new Date(file.expiresAt);
    const maxDownloadsReached = file.maxDownloads && file.downloadCount >= file.maxDownloads;

    if (isExpired || maxDownloadsReached) {
      files.delete(fileId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} expired files`);
  }
};

setInterval(cleanupExpiredFiles, 60000);

export { router as fileRouter, files };
