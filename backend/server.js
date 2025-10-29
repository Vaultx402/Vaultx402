import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
