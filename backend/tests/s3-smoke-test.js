import http from 'http';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3001';

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

const run = async () => {
  const filename = 'hello.txt';
  const contentType = 'text/plain';
  const payload = Buffer.from('hello s3');
  const maxSizeMB = 2;

  // Initiate with test payment header (X402_TEST_MODE should be true server-side)
  const paymentHeader = Buffer.from(JSON.stringify({ version: '0.0.1', signature: 'TEST', scheme: 'exact', network: 'solana' })).toString('base64');
  const init = await makeJson('/v1/uploads/initiate', 'POST', { filename, contentType, maxSizeMB }, { 'x-payment': paymentHeader });
  if (init.status !== 200) throw new Error(`init ${init.status}`);
  const { uploadUrl, objectKey, verifyUrl, fileMetaUrl } = init.body;
  if (!uploadUrl || !objectKey) throw new Error('missing upload url or key');

  // Upload
  const checksum = crypto.createHash('sha256').update(payload).digest('hex');
  const put = await makePut(uploadUrl, payload, { 'Content-Type': contentType, 'x-checksum-sha256': checksum });
  if (put.status !== 201) throw new Error(`put ${put.status}`);
  const fileId = put.body.fileId;

  // Verify metadata reports s3Key and checksum
  const verify = await makeJson(verifyUrl, 'GET');
  if (verify.status !== 200) throw new Error(`verify ${verify.status}`);
  if (verify.body.checksumSha256 !== checksum) throw new Error('checksum mismatch');

  // Pay-to-view: should 302 to S3 presigned GET
  const view = await new Promise((resolve, reject) => {
    const url = new URL(`/api/files/view/${fileId}`, BASE_URL);
    const req = http.request(url, { method: 'GET', headers: { 'x-payment': paymentHeader } }, (res) => {
      resolve({ status: res.statusCode, location: res.headers['location'] });
    });
    req.on('error', reject);
    req.end();
  });
  if (view.status !== 302) throw new Error(`view ${view.status}`);
  if (!view.location || !/amazonaws\.com/.test(String(view.location))) throw new Error('not an S3 presigned URL');

  console.log('✅ S3 smoke test passed');
  console.log('fileId:', fileId);
  console.log('verifyUrl:', new URL(verifyUrl, BASE_URL).toString());
  console.log('redirect:', view.location);
};

run().catch((e) => { console.error('❌ S3 smoke test failed:', e); process.exit(1); });


