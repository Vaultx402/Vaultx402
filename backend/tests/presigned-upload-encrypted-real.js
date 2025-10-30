import fs from 'fs';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import dotenv from 'dotenv';
import bs58 from 'bs58';
import path from 'path';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const connection = new Connection(
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  'confirmed'
);
const USDC_MINT = new PublicKey(process.env.USDC_MINT);
const TEST_WALLET = Keypair.fromSecretKey(bs58.decode(process.env.TEST_PRIVATE_KEY));
const RECIPIENT_WALLET = new PublicKey(process.env.SOLANA_WALLET_ADDRESS);

const makeJson = (path, method, data, headers = {}) => new Promise((resolve, reject) => {
  const url = new URL(path, BASE_URL);
  const req = http.request(url, { method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body || '{}') }); }
      catch { resolve({ status: res.statusCode, headers: res.headers, body }); }
    });
  });
  req.on('error', reject);
  if (data) req.write(JSON.stringify(data));
  req.end();
});

const makePut = (path, buffer, headers = {}) => new Promise((resolve, reject) => {
  const url = new URL(path, BASE_URL);
  const req = http.request(url, { method: 'PUT', headers: { 'Content-Type': headers['Content-Type'] || 'application/octet-stream', 'Content-Length': buffer.length, ...headers } }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body || '{}') }); }
      catch { resolve({ status: res.statusCode, headers: res.headers, body }); }
    });
  });
  req.on('error', reject);
  req.write(buffer);
  req.end();
});

const httpGetBuffer = (absoluteUrl) => new Promise((resolve, reject) => {
  const url = new URL(absoluteUrl);
  const client = url.protocol === 'https:' ? https : http;
  const req = client.request(url, { method: 'GET' }, (res) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks)));
  });
  req.on('error', reject);
  req.end();
});

const sendUSDCPayment = async (amountUSDC, recipientPubkey = RECIPIENT_WALLET) => {
  const amount = Math.floor(parseFloat(amountUSDC) * 1_000_000);
  const senderAta = await getAssociatedTokenAddress(USDC_MINT, TEST_WALLET.publicKey);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: TEST_WALLET.publicKey, blockhash, lastValidBlockHeight });

  try { await getAccount(connection, recipientAta); }
  catch { tx.add(createAssociatedTokenAccountInstruction(TEST_WALLET.publicKey, recipientAta, recipientPubkey, USDC_MINT)); }

  tx.add(createTransferInstruction(senderAta, recipientAta, TEST_WALLET.publicKey, amount));
  tx.sign(TEST_WALLET);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
};

const encryptAesGcm = (plaintext, password) => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([ciphertext, tag]);
  return { payload, saltHex: salt.toString('hex'), nonceHex: nonce.toString('hex') };
};

const decryptAesGcm = (payload, password, saltHex, nonceHex) => {
  const salt = Buffer.from(saltHex, 'hex');
  const nonce = Buffer.from(nonceHex, 'hex');
  const key = crypto.scryptSync(password, salt, 32);
  const tag = payload.slice(payload.length - 16);
  const ciphertext = payload.slice(0, payload.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

const run = async () => {
  const fallbackPath = '/Users/will/x402vault/frontend/public/img/stat/bullets.png';
  const originalPath = process.env.TEST_FILE_PATH || fallbackPath;
  const ext = path.extname(originalPath).toLowerCase();
  const originalType = ext === '.glb' ? 'model/gltf-binary' : (ext === '.png' ? 'image/png' : 'application/octet-stream');
  const original = fs.readFileSync(originalPath);
  const password = 'test_password_123';

  // Encrypt client-side
  const { payload: ciphertext, saltHex, nonceHex } = encryptAesGcm(original, password);
  const contentType = 'application/octet-stream';
  const maxSizeMB = Math.ceil(ciphertext.length / (1024 * 1024)) + 1;

  // 402 challenge
  const challenge = await makeJson('/v1/uploads/initiate', 'POST', {
    filename: `${path.basename(originalPath)}.enc`,
    contentType,
    maxSizeMB,
    encrypted: true,
    encAlgo: 'AES-256-GCM',
    encSalt: saltHex,
    encNonce: nonceHex,
    originalName: path.basename(originalPath),
    originalType
  });
  if (challenge.status !== 402) throw new Error(`challenge ${challenge.status}`);
  const amount = challenge.body.amount;
  const recipients = challenge.body.recipients;
  console.log('Challenge amount (USDC):', amount);
  console.log('Recipient wallet:', recipients?.[0] || RECIPIENT_WALLET.toBase58());

  // Pay
  const sig = await sendUSDCPayment(amount, new PublicKey(recipients?.[0] || RECIPIENT_WALLET));
  const paymentHeader = Buffer.from(JSON.stringify({ version: '0.0.1', signature: sig, scheme: 'exact', network: 'solana' })).toString('base64');

  // Initiate with payment
  const init = await makeJson('/v1/uploads/initiate', 'POST', {
    filename: `${path.basename(originalPath)}.enc`,
    contentType,
    maxSizeMB,
    encrypted: true,
    encAlgo: 'AES-256-GCM',
    encSalt: saltHex,
    encNonce: nonceHex,
    originalName: path.basename(originalPath),
    originalType
  }, { 'x-payment': paymentHeader });
  if (init.status !== 200) {
    console.log('init error body:', init.body);
    throw new Error(`init ${init.status}`);
  }

  // Upload ciphertext
  const checksum = crypto.createHash('sha256').update(ciphertext).digest('hex');
  const put = await makePut(init.body.uploadUrl, ciphertext, { 'Content-Type': contentType, 'x-checksum-sha256': checksum });
  if (put.status !== 201) throw new Error(`put ${put.status}`);

  // Verify
  const verify = await makeJson(init.body.verifyUrl, 'GET');
  if (verify.status !== 200) throw new Error(`verify ${verify.status}`);
  if (verify.body.encrypted !== true) throw new Error('verify encrypted flag missing');
  if (verify.body.checksumSha256 !== checksum) throw new Error('verify checksum mismatch');

  // Pay-to-view redirect and download
  const view = await new Promise((resolve, reject) => {
    const url = new URL(`/api/files/view/${put.body.fileId}`, BASE_URL);
    const req = http.request(url, { method: 'GET', headers: { 'x-payment': paymentHeader } }, (res) => {
      resolve({ status: res.statusCode, location: res.headers['location'] });
    });
    req.on('error', reject);
    req.end();
  });
  if (view.status !== 302) throw new Error(`view ${view.status}`);
  const downloaded = await httpGetBuffer(view.location);

  // Decrypt and compare
  const decrypted = decryptAesGcm(downloaded, password, saltHex, nonceHex);
  if (!decrypted.equals(original)) throw new Error('decrypted bytes do not match original');

  console.log('✅ Real encrypted e2e passed');
  console.log('Signature:', sig);
  console.log('Verify URL:', new URL(init.body.verifyUrl, BASE_URL).toString());
  console.log('File Meta URL:', new URL(init.body.fileMetaUrl, BASE_URL).toString());
};

run().catch((e) => { console.error('❌ Encrypted e2e failed:', e); process.exit(1); });


