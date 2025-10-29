import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
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

console.log('Test Wallet Public Key:', testWallet.publicKey.toBase58());
console.log('Recipient Wallet:', recipientWallet.toBase58());

const sendUSDCPayment = async (amountUSDC) => {
  try {
    const amount = Math.floor(parseFloat(amountUSDC) * 1_000_000);

    const senderAta = await getAssociatedTokenAddress(USDC_MINT, testWallet.publicKey);
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientWallet);

    console.log(`\nSending ${amountUSDC} USDC (${amount} base units)...`);
    console.log('From ATA:', senderAta.toBase58());
    console.log('To ATA:', recipientAta.toBase58());

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction({
      feePayer: testWallet.publicKey,
      blockhash,
      lastValidBlockHeight
    });

    let recipientAccountExists = true;
    try {
      await getAccount(connection, recipientAta);
      console.log('✅ Recipient ATA exists');
    } catch (error) {
      console.log('⚠️  Recipient ATA does not exist, creating it...');
      recipientAccountExists = false;
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

    console.log('Transaction signature:', signature);
    console.log('Confirming transaction...');

    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Payment confirmed!\n');
    return signature;

  } catch (error) {
    console.error('Payment error:', error);
    throw error;
  }
};

const uploadFile = async (filePath) => {
  try {
    console.log('\n=== Testing File Upload ===\n');

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileName = path.basename(filePath);

    console.log('File:', fileName);
    console.log('Size:', (fileSize / (1024 * 1024)).toFixed(2), 'MB');

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

    console.log('Uploading file to backend...');

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
        maxDownloads: 3,
        expiresIn: 3600
      })
    });

    const uploadResult = await uploadResponse.json();

    if (!uploadResponse.ok) {
      console.error('Upload failed:', uploadResult);
      throw new Error(uploadResult.error || 'Upload failed');
    }

    console.log('\n✅ File uploaded successfully!');
    console.log('File ID:', uploadResult.fileId);
    console.log('Upload details:', JSON.stringify(uploadResult, null, 2));

    return uploadResult.fileId;

  } catch (error) {
    console.error('Upload test failed:', error);
    throw error;
  }
};

const downloadFile = async (fileId) => {
  try {
    console.log('\n=== Testing File Download ===\n');
    console.log('File ID:', fileId);

    const downloadPrice = process.env.DOWNLOAD_PRICE || '0.01';
    console.log('Required payment:', downloadPrice, 'USDC');

    const signature = await sendUSDCPayment(downloadPrice);

    const paymentData = {
      version: '0.0.1',
      signature,
      scheme: 'exact',
      network: 'solana'
    };

    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    console.log('Downloading file from backend...');

    const downloadResponse = await fetch(`${BASE_URL}/api/files/download/${fileId}`, {
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

    console.log('\n✅ File downloaded successfully!');
    console.log('Download details:', JSON.stringify(downloadResult, null, 2));

    return downloadResult;

  } catch (error) {
    console.error('Download test failed:', error);
    throw error;
  }
};

const getFileInfo = async (fileId) => {
  try {
    console.log('\n=== Getting File Info ===\n');

    const response = await fetch(`${BASE_URL}/api/files/${fileId}`);
    const result = await response.json();

    if (!response.ok) {
      console.error('Failed to get file info:', result);
      return;
    }

    console.log('File info:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error('Failed to get file info:', error);
  }
};

const runTests = async () => {
  try {
    const testFilePath = '/Users/will/Desktop/xxx.glb';

    if (!fs.existsSync(testFilePath)) {
      console.error('Test file not found:', testFilePath);
      process.exit(1);
    }

    const balance = await connection.getBalance(testWallet.publicKey);
    console.log('Test wallet SOL balance:', (balance / 1e9).toFixed(4), 'SOL\n');

    const fileId = await uploadFile(testFilePath);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await getFileInfo(fileId);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await downloadFile(fileId);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await getFileInfo(fileId);

    console.log('\n✅ All tests completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
};

runTests();
