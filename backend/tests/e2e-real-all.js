import fs from 'fs';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
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

const DOWNLOAD_PRICE = parseFloat(process.env.DOWNLOAD_PRICE || '0.01');
const DELETE_PRICE = parseFloat(process.env.DELETE_PRICE || '0.005');
const PRESIGN_TTL = parseInt(process.env.S3_PRESIGN_DOWNLOAD_TTL_SECONDS || '60', 10);
const CLEANUP_INTERVAL = parseInt(process.env.EXPIRED_CLEANUP_INTERVAL_SECONDS || '60', 10);

const makeJson = (p, method = 'GET', data = null, headers = {}) => new Promise((resolve, reject) => {
  const url = new URL(p, BASE_URL);
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

const makePut = (p, buffer, headers = {}) => new Promise((resolve, reject) => {
  const url = new URL(p, BASE_URL);
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

async function sendUSDCPayment(amountUSDC, recipientPubkey = RECIPIENT_WALLET) {
  const amount = Math.floor(parseFloat(amountUSDC) * 1_000_000);
  const senderAta = await getAssociatedTokenAddress(USDC_MINT, TEST_WALLET.publicKey);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);

  const { blockhash, lastValidBlockHeight } = await HELIUS.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: TEST_WALLET.publicKey, blockhash, lastValidBlockHeight });

  try { await getAccount(HELIUS, recipientAta); }
  catch { tx.add(createAssociatedTokenAccountInstruction(TEST_WALLET.publicKey, recipientAta, recipientPubkey, USDC_MINT)); }

  tx.add(createTransferInstruction(senderAta, recipientAta, TEST_WALLET.publicKey, amount));
  tx.sign(TEST_WALLET);
  const sig = await HELIUS.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await HELIUS.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

const paymentHeaderForSig = (signature) => Buffer.from(JSON.stringify({ version: '0.0.1', signature, scheme: 'exact', network: 'solana' })).toString('base64');

async function uploadViaSession({ filename, contentType, payload, maxSizeMB, maxDownloads = null, expiresIn = null, encrypted = false, encMeta = {} }) {
  // 402
  const challenge = await makeJson('/v1/uploads/initiate', 'POST', { filename, contentType, maxSizeMB, maxDownloads, expiresIn, encrypted, ...encMeta });
  if (challenge.status !== 402) throw new Error(`challenge ${challenge.status}`);
  const amount = challenge.body.amount;
  const recipients = challenge.body.recipients;

  // pay
  const recipientKey = new PublicKey(recipients?.[0] || RECIPIENT_WALLET);
  const sig = await sendUSDCPayment(amount, recipientKey);
  const header = { 'x-payment': paymentHeaderForSig(sig) };

  // initiate
  const init = await makeJson('/v1/uploads/initiate', 'POST', { filename, contentType, maxSizeMB, maxDownloads, expiresIn, encrypted, ...encMeta }, header);
  if (init.status !== 200) throw new Error(`init ${init.status}`);

  // put
  const checksum = crypto.createHash('sha256').update(payload).digest('hex');
  const put = await makePut(init.body.uploadUrl, payload, { 'Content-Type': contentType, 'x-checksum-sha256': checksum });
  if (put.status !== 201) throw new Error(`put ${put.status}`);
  const fileId = put.body.fileId;

  // verify
  const verify = await makeJson(init.body.verifyUrl, 'GET');
  if (verify.status !== 200) throw new Error(`verify ${verify.status}`);
  if (verify.body.checksumSha256 !== checksum) throw new Error('verify checksum mismatch');

  return { fileId, fileMetaUrl: init.body.fileMetaUrl };
}

async function payToView(fileId) {
  const sig = await sendUSDCPayment(DOWNLOAD_PRICE);
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/files/view/${fileId}`, BASE_URL);
    const req = http.request(url, { method: 'GET', headers: { 'x-payment': paymentHeaderForSig(sig) } }, (res) => {
      resolve({ status: res.statusCode, location: res.headers['location'] });
    });
    req.on('error', reject);
    req.end();
  });
}

async function ownerDelete(fileId) {
  const sig = await sendUSDCPayment(DELETE_PRICE);
  const res = await makeJson(`/api/files/${fileId}`, 'DELETE', null, { 'x-payment': paymentHeaderForSig(sig) });
  return res;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('Wallet:', TEST_WALLET.publicKey.toBase58());

  // A) Plain upload, burn-on-read (maxDownloads=1), ensure deletion after TTL
  const fallbackPath = '/Users/will/x402vault/frontend/public/img/stat/bullets.png';
  const plainPath = process.env.TEST_FILE_PATH || fallbackPath;
  const contentTypePlain = path.extname(plainPath).toLowerCase() === '.png' ? 'image/png' : 'application/octet-stream';
  const payloadPlain = fs.readFileSync(plainPath);
  const maxSizeMBPlain = Math.max(2, Math.ceil(payloadPlain.length / (1024 * 1024)));

  console.log('\n--- A) Plain upload with burn-on-read ---');
  const { fileId: fileIdA, fileMetaUrl: metaUrlA } = await uploadViaSession({ filename: path.basename(plainPath), contentType: contentTypePlain, payload: payloadPlain, maxSizeMB: maxSizeMBPlain, maxDownloads: 1 });
  console.log('File A:', fileIdA);

  const view1 = await payToView(fileIdA);
  if (view1.status !== 302) throw new Error(`view1 ${view1.status}`);
  console.log('View1 redirect:', view1.location);

  const view2 = await payToView(fileIdA);
  if (view2.status !== 410) throw new Error(`view2 expected 410, got ${view2.status}`);
  console.log('View2 blocked as expected (expired/max downloads).');

  // B) Encrypted upload (maxDownloads=2), one view, then owner delete
  console.log('\n--- B) Encrypted upload and owner delete ---');
  const original = payloadPlain;
  const password = 'agent_test_pw_123';
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(original), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedPayload = Buffer.concat([ciphertext, tag]);
  const encMeta = { encAlgo: 'AES-256-GCM', encSalt: salt.toString('hex'), encNonce: nonce.toString('hex'), originalName: path.basename(plainPath), originalType: contentTypePlain };

  const { fileId: fileIdB, fileMetaUrl: metaUrlB } = await uploadViaSession({ filename: `${path.basename(plainPath)}.enc`, contentType: 'application/octet-stream', payload: encryptedPayload, maxSizeMB: Math.ceil(encryptedPayload.length / (1024 * 1024)) + 1, maxDownloads: 2, encrypted: true, encMeta });
  console.log('File B:', fileIdB);

  const v1 = await payToView(fileIdB);
  if (v1.status !== 302) throw new Error(`enc view1 ${v1.status}`);

  const delRes = await ownerDelete(fileIdB);
  if (delRes.status !== 200) throw new Error(`owner delete ${delRes.status}`);
  const metaAfterDel = await makeJson(metaUrlB, 'GET');
  if (metaAfterDel.status !== 404) throw new Error(`expected 404 after owner delete, got ${metaAfterDel.status}`);
  console.log('Owner delete succeeded.');

  // C) Max size enforcement
  console.log('\n--- C) Max size enforcement ---');
  const smallMaxMB = 1;
  const tooLarge = Buffer.alloc((smallMaxMB * 1024 * 1024) + 128 * 1024, 0xab);
  const initC = await makeJson('/v1/uploads/initiate', 'POST', { filename: 'toolarge.bin', contentType: 'application/octet-stream', maxSizeMB: smallMaxMB });
  if (initC.status !== 402) throw new Error(`C challenge ${initC.status}`);
  const sigC = await sendUSDCPayment(initC.body.amount, new PublicKey(initC.body.recipients?.[0] || RECIPIENT_WALLET));
  const okC = await makeJson('/v1/uploads/initiate', 'POST', { filename: 'toolarge.bin', contentType: 'application/octet-stream', maxSizeMB: smallMaxMB }, { 'x-payment': paymentHeaderForSig(sigC) });
  if (okC.status !== 200) throw new Error(`C init paid ${okC.status}`);
  const putC = await makePut(okC.body.uploadUrl, tooLarge, { 'Content-Type': 'application/octet-stream' });
  if (putC.status !== 413) throw new Error(`expected 413 for oversize, got ${putC.status}`);
  console.log('Max size enforcement works.');

  console.log('\n✅ FULL REAL-MONEY E2E PASSED');
}

run().catch((e) => { console.error('\n❌ FULL REAL-MONEY E2E FAILED:', e); process.exit(1); });
