import express from 'express';
import { createRouteHandler } from 'uploadthing/server';
import { uploadRouter } from '../lib/uploadthing.js';
import { x402Middleware } from '../middleware/x402.js';

const router = express.Router();

const files = new Map();

router.post(
  '/upload',
  x402Middleware(process.env.UPLOAD_PRICE || '0.001'),
  async (req, res) => {
    try {
      const { fileName, fileSize, fileType, metadata } = req.body;

      if (!fileName) {
        return res.status(400).json({
          error: 'fileName is required'
        });
      }

      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const fileRecord = {
        id: fileId,
        name: fileName,
        size: fileSize,
        type: fileType,
        metadata: metadata || {},
        uploadedAt: new Date().toISOString(),
        paymentSignature: req.payment.signature,
        status: 'pending'
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
  }
);

router.get(
  '/download/:fileId',
  x402Middleware(process.env.DOWNLOAD_PRICE || '0.001'),
  async (req, res) => {
    try {
      const { fileId } = req.params;

      const file = files.get(fileId);

      if (!file) {
        return res.status(404).json({
          error: 'File not found'
        });
      }

      res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify({
        signature: req.payment.signature,
        amount: req.payment.amount
      }));

      res.json({
        success: true,
        file
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
    const { limit = 50, offset = 0 } = req.query;

    const fileList = Array.from(files.values())
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

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
  x402Middleware(process.env.DELETE_PRICE || '0.0005'),
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

    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        status: file.status
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
