import express from 'express';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const connection = new Connection(
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  'confirmed'
);

const USDC_MINT = new PublicKey(process.env.USDC_MINT);

router.post('/verify', async (req, res) => {
  try {
    const { signature, expectedAmount, expectedRecipient } = req.body;

    if (!signature || !expectedAmount || !expectedRecipient) {
      return res.status(400).json({
        error: 'Missing required fields: signature, expectedAmount, expectedRecipient'
      });
    }

    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!tx) {
      return res.status(404).json({
        error: 'Transaction not found',
        verified: false
      });
    }

    if (tx.meta?.err) {
      return res.status(400).json({
        error: 'Transaction failed on chain',
        verified: false
      });
    }

    const recipientAta = await getAssociatedTokenAddress(
      USDC_MINT,
      new PublicKey(expectedRecipient)
    );

    const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;
    const ataIndex = accountKeys.findIndex(
      key => key.toBase58() === recipientAta.toBase58()
    );

    if (ataIndex === -1) {
      return res.status(400).json({
        error: 'Recipient token account not found in transaction',
        verified: false
      });
    }

    const postTokenBalances = tx.meta.postTokenBalances || [];
    const preTokenBalances = tx.meta.preTokenBalances || [];

    const postBalance = postTokenBalances.find(b => b.accountIndex === ataIndex);
    const preBalance = preTokenBalances.find(b => b.accountIndex === ataIndex);

    if (!postBalance || !preBalance) {
      return res.status(400).json({
        error: 'Token balance information not found',
        verified: false
      });
    }

    const amountTransferred = parseFloat(postBalance.uiTokenAmount.uiAmount) -
                              parseFloat(preBalance.uiTokenAmount.uiAmount);
    const expectedUSDC = parseFloat(expectedAmount);

    if (amountTransferred < expectedUSDC) {
      return res.status(400).json({
        error: 'Insufficient payment amount',
        expected: expectedUSDC,
        received: amountTransferred,
        verified: false
      });
    }

    res.json({
      verified: true,
      signature,
      amount: amountTransferred,
      recipient: expectedRecipient,
      timestamp: tx.blockTime,
      token: 'USDC'
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      error: 'Payment verification failed',
      details: error.message
    });
  }
});

router.post('/settle', async (req, res) => {
  try {
    const { transaction } = req.body;

    if (!transaction) {
      return res.status(400).json({
        error: 'Missing transaction data'
      });
    }

    const txBuffer = Buffer.from(transaction, 'base64');
    const tx = Transaction.from(txBuffer);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });

    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    res.json({
      signature,
      confirmed: !confirmation.value.err,
      error: confirmation.value.err || null
    });

  } catch (error) {
    console.error('Payment settlement error:', error);
    res.status(500).json({
      error: 'Payment settlement failed',
      details: error.message
    });
  }
});

router.get('/supported', (req, res) => {
  res.json({
    schemes: ['exact'],
    networks: ['solana'],
    tokens: ['USDC'],
    mint: process.env.USDC_MINT
  });
});

router.get('/wallet', (req, res) => {
  const walletAddress = process.env.SOLANA_WALLET_ADDRESS;

  if (!walletAddress) {
    return res.status(500).json({
      error: 'Wallet not configured'
    });
  }

  res.json({
    address: walletAddress,
    network: 'solana'
  });
});

export { router as paymentRouter };
