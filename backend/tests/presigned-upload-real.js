import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const HELIUS = new Connection(
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  'confirmed'
);
const USDC_MINT = new PublicKey(process.env.USDC_MINT);
const TEST_WALLET = Keypair.fromSecretKey(bs58.decode(process.env.TEST_PRIVATE_KEY));
const RECIPIENT_WALLET = new PublicKey(process.env.SOLANA_WALLET_ADDRESS);

const makeJsonRequest = (path, method = 'GET', data = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body || '{}') });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
};

const makeBinaryPut = (path, buffer, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': headers['Content-Type'] || 'application/octet-stream',
        'Content-Length': buffer.length,
        ...headers
      }
    };
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body || '{}') });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
};

const sendUSDCPayment = async (amountUSDC, recipientPubkey = RECIPIENT_WALLET) => {
  const amount = Math.floor(parseFloat(amountUSDC) * 1_000_000);
  const senderAta = await getAssociatedTokenAddress(USDC_MINT, TEST_WALLET.publicKey);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);

  const { blockhash, lastValidBlockHeight } = await HELIUS.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: TEST_WALLET.publicKey, blockhash, lastValidBlockHeight });

  try {
    await getAccount(HELIUS, recipientAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        TEST_WALLET.publicKey,
        recipientAta,
        recipientPubkey,
        USDC_MINT
      )
    );
  }

  tx.add(createTransferInstruction(senderAta, recipientAta, TEST_WALLET.publicKey, amount));
  tx.sign(TEST_WALLET);
  const sig = await HELIUS.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await HELIUS.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
};

const run = async () => {
  const fallbackPath = '/Users/will/x402vault/frontend/public/img/stat/bullets.png';
  const testFilePath = process.env.TEST_FILE_PATH || fallbackPath;
  const ext = path.extname(testFilePath).toLowerCase();
  const contentType = ext === '.glb' ? 'model/gltf-binary' : (ext === '.png' ? 'image/png' : 'application/octet-stream');
  const payload = fs.readFileSync(testFilePath);
  const maxSizeMB = Math.max(2, Math.ceil(payload.length / (1024 * 1024)));

  console.log('Initiating (expect 402 challenge)...');
  const challenge = await makeJsonRequest('/v1/uploads/initiate', 'POST', {
    filename: path.basename(testFilePath),
    contentType,
    maxSizeMB
  });
  if (challenge.status !== 402) throw new Error(`Expected 402, got ${challenge.status}`);
  const { amount, recipients, reference, expiresAt } = challenge.body;
  console.log('Challenge amount (USDC):', amount);
  console.log('Recipient wallet:', recipients?.[0] || RECIPIENT_WALLET.toBase58());
  console.log('Reference:', reference, 'expiresAt:', expiresAt);

  console.log('Sending on-chain USDC payment...');
  const recipientKey = new PublicKey(recipients?.[0] || RECIPIENT_WALLET);
  const signature = await sendUSDCPayment(amount, recipientKey);
  console.log('Payment signature:', signature);

  const paymentHeader = Buffer.from(JSON.stringify({
    version: '0.0.1',
    signature,
    scheme: 'exact',
    network: 'solana'
  })).toString('base64');

  console.log('Retrying initiate with payment...');
  const initiate = await makeJsonRequest('/v1/uploads/initiate', 'POST', {
    filename: path.basename(testFilePath),
    contentType,
    maxSizeMB
  }, { 'x-payment': paymentHeader });
  if (initiate.status !== 200) {
    console.log('Initiate error body:', JSON.stringify(initiate.body));
    throw new Error(`Expected 200, got ${initiate.status}`);
  }

  const { uploadUrl, objectKey, verifyUrl, fileMetaUrl } = initiate.body;
  console.log('Upload URL:', uploadUrl);
  console.log('Object Key:', objectKey);
  console.log('Verify URL:', verifyUrl);
  console.log('File Meta URL:', fileMetaUrl);

  const checksum = crypto.createHash('sha256').update(payload).digest('hex');
  console.log('Uploading bytes with checksum:', checksum);
  const uploaded = await makeBinaryPut(uploadUrl, payload, { 'Content-Type': contentType, 'x-checksum-sha256': checksum });
  if (uploaded.status !== 201) throw new Error(`Expected 201, got ${uploaded.status}`);
  console.log('Upload complete fileId:', uploaded.body.fileId);

  console.log('Verifying...');
  const verify = await makeJsonRequest(verifyUrl, 'GET');
  if (verify.status !== 200) throw new Error(`Expected 200 verify, got ${verify.status}`);
  if (verify.body.size !== payload.length) throw new Error('Verify size mismatch');
  if (verify.body.checksumSha256 !== checksum) throw new Error('Verify checksum mismatch');

  const meta = await makeJsonRequest(fileMetaUrl, 'GET');
  if (meta.status !== 200) throw new Error(`Expected 200 meta, got ${meta.status}`);
  if (meta.body.file.size !== payload.length) throw new Error('Meta size mismatch');

  // Pay-to-view: should 302 to S3 presigned GET
  const view = await new Promise((resolve, reject) => {
    const url = new URL(`/api/files/view/${uploaded.body.fileId}`, BASE_URL);
    const req = http.request(url, { method: 'GET', headers: { 'x-payment': paymentHeader } }, (res) => {
      resolve({ status: res.statusCode, location: res.headers['location'] });
    });
    req.on('error', reject);
    req.end();
  });
  if (view.status !== 302) throw new Error(`Expected 302 view, got ${view.status}`);
  if (!view.location || !/amazonaws\.com/.test(String(view.location))) throw new Error('View redirect is not S3 presigned URL');

  console.log('\n✅ Real presigned upload flow passed');
  console.log('Signature:', signature);
  console.log('Verify URL:', new URL(verifyUrl, BASE_URL).toString());
  console.log('File Meta URL:', new URL(fileMetaUrl, BASE_URL).toString());
  console.log('View Redirect:', view.location);
};

run().catch((e) => {
  console.error('\n❌ Real presigned upload flow failed:', e);
  process.exit(1);
});


