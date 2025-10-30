# x402vault Backend

Express server implementing the x402 payment protocol for file exchange operations on Solana.

## Features

- x402 payment protocol integration for Solana with USDC
- Dynamic pricing: 0.01 USDC per MB for uploads
- Privacy features:
  - Configurable max download limits per file
  - File expiration/TTL (time to live)
  - Automatic cleanup of expired files every 60 seconds
- File upload/download with payment verification
- S3-based presigned uploads for file storage
- RESTful API with clean routing structure
- Payment verification and settlement endpoints

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Required environment variables:
- `SOLANA_WALLET_ADDRESS`: Your Solana wallet address for receiving USDC payments
- `HELIUS_API_KEY`: Your Helius RPC API key
- `USDC_MINT`: USDC token mint address (default: mainnet USDC)
- `MAX_FILE_SIZE`: Maximum file size in MB (default: 50)
- `PORT`: Server port (default: 3001)

S3 storage (required):
- `S3_BUCKET`, `S3_REGION`, `S3_UPLOAD_KEY_PREFIX`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `S3_PRESIGN_UPLOAD_TTL_SECONDS`, `S3_PRESIGN_DOWNLOAD_TTL_SECONDS`

## Running

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Testing

Run the test suite:
```bash
npm test
```

## API Endpoints

### Health
- `GET /api/health` - Server health check

### Files
- `POST /v1/uploads/initiate` - Begin an upload session
  - 402 challenge if unpaid: `{ chain, tokenMint, amount, recipients, reference, expiresAt }`
  - On success with `X-PAYMENT`: `{ method, uploadUrl, objectKey, uploadExpiresAt, contentType, maxBytes, checksum, verifyUrl, fileMetaUrl }`
- `PUT /v1/uploads/upload/:uploadId` - Upload file bytes (binary body)
- `GET /v1/uploads/verify/:objectKey` - Verify upload status and checksum
- `GET /api/files/view/:fileId` - Pay-to-view: redirects (302) to S3 presigned URL
- `GET /api/files/list` - List all active files
  - Query params: `limit`, `offset`, `includeExpired`
- `GET /api/files/:fileId` - Get file metadata (free, no payment required)
- `DELETE /api/files/:fileId` - Delete file (requires x402 payment, fixed 0.005 USDC)

### Payments
- `POST /api/payments/verify` - Verify Solana transaction
- `POST /api/payments/settle` - Settle payment on-chain
- `GET /api/payments/supported` - Get supported payment schemes
- `GET /api/payments/wallet` - Get wallet address

## x402 Protocol

This server implements the x402 payment protocol with **USDC-only** payments. Protected endpoints return a `402 Payment Required` status with payment requirements:

```json
{
  "version": "0.0.1",
  "requirements": [{
    "scheme": "exact",
    "network": "solana",
    "maxAmount": "0.01",
    "recipient": "wallet_address",
    "asset": "USDC",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "timeout": 300,
    "resource": "/v1/uploads/initiate",
    "description": "Payment required for file operation"
  }]
}
```

Clients must include payment proof in the `X-PAYMENT` header as base64-encoded JSON containing the USDC transaction signature.

### Payment Verification

The server verifies USDC payments by:
1. Fetching the transaction from Solana via Helius RPC
2. Checking the recipient's associated token account (ATA) for USDC
3. Verifying the token balance change matches the required amount
4. Confirming the transaction succeeded on-chain

## Architecture

```
backend/
├── server.js           # Main Express app
├── routes/
│   ├── files.js        # File operations
│   ├── payments.js     # Payment verification
│   └── health.js       # Health check
├── middleware/
│   └── x402.js         # x402 payment middleware
├── routes/
│   └── uploads.js      # Presigned upload/session handling
└── tests/
    ├── api.test.js                         # API tests (no-chain)
    ├── presigned-upload-real.js            # Real USDC + presigned upload flow
    └── presigned-upload-encrypted-real.js  # Real USDC + client-side encrypted flow
```

## Payment Pricing

All payments are processed using **USDC on Solana mainnet**.

### Dynamic Pricing (configurable via .env):
- **Upload**: 0.01 USDC per MB (calculated based on file size)
  - Example: 5MB file = 0.05 USDC
  - Example: 0.5MB file = 0.01 USDC (minimum)
- **Download**: 0.01 USDC (fixed)
- **Delete**: 0.005 USDC (fixed)

### Privacy Features

**Max Downloads:**
Set `maxDownloads` when uploading to limit how many times a file can be downloaded. Once the limit is reached, the file becomes inaccessible and is automatically deleted.

**File Expiration (TTL):**
Set `expiresIn` (in seconds) when uploading to automatically expire files after a certain time. Expired files are automatically cleaned up every 60 seconds.

**Example Upload Request:**
```json
{
  "fileName": "secret.pdf",
  "fileSize": 5242880,
  "fileType": "application/pdf",
  "maxDownloads": 3,
  "expiresIn": 86400
}
```
This creates a 5MB file that:
- Costs 0.05 USDC to upload
- Can be downloaded 3 times max
- Expires after 24 hours (86400 seconds)
