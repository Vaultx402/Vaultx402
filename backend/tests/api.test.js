import http from 'http';

const BASE_URL = 'http://localhost:3001';

const makeRequest = (path, method = 'GET', data = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsedBody = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsedBody
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
};

const runTests = async () => {
  console.log('Starting x402vault API tests...\n');

  let passed = 0;
  let failed = 0;

  const test = async (name, testFn) => {
    try {
      await testFn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      failed++;
    }
  };

  await test('Health check', async () => {
    const res = await makeRequest('/api/health');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (res.body.status !== 'ok') throw new Error('Health check failed');
  });

  await test('Get supported payment methods', async () => {
    const res = await makeRequest('/api/payments/supported');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.schemes.includes('exact')) throw new Error('Missing exact scheme');
    if (!res.body.networks.includes('solana')) throw new Error('Missing solana network');
  });

  await test('Get wallet address', async () => {
    const res = await makeRequest('/api/payments/wallet');
    if (res.status !== 200 && res.status !== 500) {
      throw new Error(`Expected 200 or 500, got ${res.status}`);
    }
  });

  await test('List files without payment', async () => {
    const res = await makeRequest('/api/files/list');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!Array.isArray(res.body.files)) throw new Error('Expected files array');
  });

  await test('Get file without ID returns 404', async () => {
    const res = await makeRequest('/api/files/nonexistent_file');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  await test('Upload without payment returns 402', async () => {
    const res = await makeRequest('/api/files/upload', 'POST', {
      fileName: 'test.txt',
      fileSize: 1024,
      fileType: 'text/plain'
    });
    if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    if (!res.body.requirements) throw new Error('Missing payment requirements');
  });

  await test('Download without payment returns 402', async () => {
    const res = await makeRequest('/api/files/download/test123', 'GET');
    if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
  });

  await test('Delete without payment returns 402', async () => {
    const res = await makeRequest('/api/files/test123', 'DELETE');
    if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
  });

  await test('Upload with invalid payment returns 400', async () => {
    const invalidPayment = Buffer.from(JSON.stringify({
      signature: 'invalid',
      scheme: 'exact',
      network: 'solana'
    })).toString('base64');

    const res = await makeRequest('/api/files/upload', 'POST', {
      fileName: 'test.txt',
      fileSize: 1024,
      fileType: 'text/plain'
    }, {
      'x-payment': invalidPayment
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await test('Verify payment with missing fields returns 400', async () => {
    const res = await makeRequest('/api/payments/verify', 'POST', {
      signature: 'test'
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await test('Settle payment with missing transaction returns 400', async () => {
    const res = await makeRequest('/api/payments/settle', 'POST', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};

runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
