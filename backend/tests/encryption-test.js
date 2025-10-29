import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BASE_URL = 'http://localhost:3001';
const connection = new Connection(
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  'confirmed'
);

const USDC_MINT = new PublicKey(process.env.USDC_MINT);
const testWallet = Keypair.fromSecretKey(bs58.decode(process.env.TEST_PRIVATE_KEY));
const recipientWallet = new PublicKey(process.env.SOLANA_WALLET_ADDRESS);

const sendUSDCPayment = async (amountUSDC) => {
  try {
    const amount = Math.floor(parseFloat(amountUSDC) * 1_000_000);

    const senderAta = await getAssociatedTokenAddress(USDC_MINT, testWallet.publicKey);
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientWallet);

    console.log(`\nSending ${amountUSDC} USDC (${amount} base units)...`);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction({
      feePayer: testWallet.publicKey,
      blockhash,
      lastValidBlockHeight
    });

    try {
      await getAccount(connection, recipientAta);
    } catch (error) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          testWallet.publicKey,
          recipientAta,
          recipientWallet,
          USDC_MINT
        )
      );
    }

    transaction.add(
      createTransferInstruction(
        senderAta,
        recipientAta,
        testWallet.publicKey,
        amount
      )
    );

    transaction.sign(testWallet);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    console.log('✅ Payment confirmed:', signature);
    return signature;

  } catch (error) {
    console.error('Payment error:', error);
    throw error;
  }
};

const uploadEncryptedFile = async (filePath, password) => {
  try {
    console.log('\n=== Testing Encrypted File Upload ===\n');

    const fileBuffer = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileName = path.basename(filePath);

    console.log('File:', fileName);
    console.log('Size:', (fileSize / (1024 * 1024)).toFixed(2), 'MB');
    console.log('Password:', password ? '***' : 'none');

    const pricePerMB = parseFloat(process.env.PRICE_PER_MB || '0.01');
    const fileSizeMB = fileSize / (1024 * 1024);
    const requiredPrice = (fileSizeMB * pricePerMB).toFixed(2);

    console.log('Required payment:', requiredPrice, 'USDC');

    const signature = await sendUSDCPayment(requiredPrice);

    const paymentData = {
      version: '0.0.1',
      signature,
      scheme: 'exact',
      network: 'solana'
    };

    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    console.log('Uploading encrypted file to backend...');

    const uploadResponse = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader
      },
      body: JSON.stringify({
        fileName,
        fileSize,
        fileType: 'model/gltf-binary',
        maxDownloads: 2,
        expiresIn: 7200,
        password,
        fileData: fileBuffer.toString('base64')
      })
    });

    const uploadResult = await uploadResponse.json();

    if (!uploadResponse.ok) {
      console.error('Upload failed:', uploadResult);
      throw new Error(uploadResult.error || 'Upload failed');
    }

    console.log('\n✅ Encrypted file uploaded!');
    console.log('File ID:', uploadResult.fileId);
    console.log('Encrypted:', uploadResult.file.encrypted);

    return { fileId: uploadResult.fileId, originalData: fileBuffer };

  } catch (error) {
    console.error('Upload test failed:', error);
    throw error;
  }
};

const downloadEncryptedFile = async (fileId, password) => {
  try {
    console.log('\n=== Testing Encrypted File Download ===\n');
    console.log('File ID:', fileId);

    const downloadPrice = process.env.DOWNLOAD_PRICE || '0.01';
    const signature = await sendUSDCPayment(downloadPrice);

    const paymentData = {
      version: '0.0.1',
      signature,
      scheme: 'exact',
      network: 'solana'
    };

    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const url = password
      ? `${BASE_URL}/api/files/download/${fileId}?password=${encodeURIComponent(password)}`
      : `${BASE_URL}/api/files/download/${fileId}`;

    console.log('Downloading with password:', password ? '***' : 'none');

    const downloadResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'X-PAYMENT': paymentHeader
      }
    });

    const downloadResult = await downloadResponse.json();

    if (!downloadResponse.ok) {
      console.error('Download failed:', downloadResult);
      throw new Error(downloadResult.error || 'Download failed');
    }

    console.log('\n✅ File downloaded!');
    console.log('Has fileData:', !!downloadResult.fileData);
    console.log('Remaining downloads:', downloadResult.remainingDownloads);

    return downloadResult.fileData;

  } catch (error) {
    console.error('Download test failed:', error);
    throw error;
  }
};

const runTests = async () => {
  try {
    const testFilePath = '/Users/will/Desktop/xxx.glb';
    const password = 'super_secret_password_123';

    console.log('Test Wallet:', testWallet.publicKey.toBase58());
    console.log('Recipient Wallet:', recipientWallet.toBase58());

    const { fileId, originalData } = await uploadEncryptedFile(testFilePath, password);

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Testing download with WRONG password ---');
    try {
      await downloadEncryptedFile(fileId, 'wrong_password');
      console.log('❌ Should have failed with wrong password!');
    } catch (error) {
      console.log('✅ Correctly rejected wrong password');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Testing download with CORRECT password ---');
    const downloadedData = await downloadEncryptedFile(fileId, password);

    const downloadedBuffer = Buffer.from(downloadedData, 'base64');

    if (downloadedBuffer.equals(originalData)) {
      console.log('\n🎉 SUCCESS! Decrypted file matches original!');
      console.log('Original size:', originalData.length, 'bytes');
      console.log('Downloaded size:', downloadedBuffer.length, 'bytes');
    } else {
      console.log('\n❌ ERROR! Files do not match!');
      console.log('Original size:', originalData.length);
      console.log('Downloaded size:', downloadedBuffer.length);
    }

    console.log('\n✅ All encryption tests completed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
};

runTests();
