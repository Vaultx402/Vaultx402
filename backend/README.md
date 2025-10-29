# x402vault Backend

Express server implementing the x402 payment protocol for file exchange operations on Solana.

## Features

- x402 payment protocol integration for Solana
- File upload/download with payment verification
- UploadThing integration for file storage
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
- `UPLOADTHING_TOKEN`: Your UploadThing API token
- `USDC_MINT`: USDC token mint address (default: mainnet USDC)
- `MAX_FILE_SIZE`: Maximum file size in MB (default: 50)
- `PORT`: Server port (default: 3001)

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
- `POST /api/files/upload` - Upload file (requires x402 payment)
- `GET /api/files/download/:fileId` - Download file (requires x402 payment)
- `GET /api/files/list` - List all files
- `GET /api/files/:fileId` - Get file metadata
- `DELETE /api/files/:fileId` - Delete file (requires x402 payment)

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
    "resource": "/api/files/upload",
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
├── lib/
│   └── uploadthing.js  # UploadThing configuration
└── tests/
    └── api.test.js     # API tests
```

## Payment Prices

Default prices in USDC (configurable via .env):
- Upload: 0.01 USDC
- Download: 0.01 USDC
- Delete: 0.005 USDC

All payments are processed using USDC on Solana mainnet.
