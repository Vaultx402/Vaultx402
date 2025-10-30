import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db } from './db/client.js';
import { fileRouter } from './routes/files.js';
import { paymentRouter } from './routes/payments.js';
import { healthRouter } from './routes/health.js';
import { uploadsRouter } from './routes/uploads.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use('/api/health', healthRouter);
app.use('/api/files', fileRouter);
app.use('/api/payments', paymentRouter);
app.use('/v1/uploads', uploadsRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`x402vault backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Background cleanup of expired files and scheduled deletions
const AUTO_DELETE_EXPIRED = process.env.AUTO_DELETE_EXPIRED !== 'false';
const CLEANUP_INTERVAL_SECONDS = parseInt(process.env.EXPIRED_CLEANUP_INTERVAL_SECONDS || '60', 10);
const DOWNLOAD_TTL_SECONDS = parseInt(process.env.S3_PRESIGN_DOWNLOAD_TTL_SECONDS || '60', 10);

async function cleanupExpiredFiles() {
  if (!AUTO_DELETE_EXPIRED) return;
  const now = new Date();
  try {
    // Mark files expired by time if needed
    await db.query(`update files set status='expired' where status!='expired' and expires_at is not null and now() > expires_at`);

    // Select candidates for deletion
    const { rows } = await db.query(
      `select id, s3_key, expires_at, delete_after from files where status='expired'`
    );

    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    const s3 = bucket && region ? new S3Client({ region }) : null;

    for (const r of rows) {
      const deleteAfter = r.delete_after ? new Date(r.delete_after) : null;
      const expiresAt = r.expires_at ? new Date(r.expires_at) : null;
      const dueByDeleteAfter = deleteAfter && now > deleteAfter;
      const dueByExpiry = expiresAt && (now.getTime() - expiresAt.getTime()) >= DOWNLOAD_TTL_SECONDS * 1000;
      if (!(dueByDeleteAfter || dueByExpiry)) continue;

      try {
        if (s3 && r.s3_key) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: r.s3_key }));
        }
      } catch {}

      try {
        await db.query('delete from files where id=$1', [r.id]);
      } catch {}
    }
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}

if (AUTO_DELETE_EXPIRED) {
  setInterval(cleanupExpiredFiles, CLEANUP_INTERVAL_SECONDS * 1000);
}
