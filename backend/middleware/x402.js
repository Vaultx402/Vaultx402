import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  'confirmed'
);

// Lazily construct PublicKeys only when needed to allow test-mode without valid keys

export const x402Middleware = (requiredAmount) => {
  return async (req, res, next) => {
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      return res.status(402).json({
        version: '0.0.1',
        requirements: [{
          scheme: 'exact',
          network: 'solana',
          maxAmount: requiredAmount,
          recipient: process.env.SOLANA_WALLET_ADDRESS,
          asset: 'USDC',
          mint: process.env.USDC_MINT,
          timeout: 300,
          resource: req.originalUrl,
          description: 'Payment required for file operation'
        }],
        error: 'Payment required'
      });
    }

    try {
      // Test mode: accept any payment header and short-circuit verification
      if (process.env.X402_TEST_MODE === 'true') {
        req.payment = {
          verified: true,
          signature: 'TEST_SIGNATURE',
          amount: parseFloat(requiredAmount),
          timestamp: Math.floor(Date.now() / 1000),
          token: 'USDC'
        };
        return next();
      }

      const paymentData = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString('utf-8')
      );

      const { signature, scheme, network } = paymentData;

      if (scheme !== 'exact' || network !== 'solana') {
        return res.status(400).json({
          error: 'Unsupported payment scheme or network'
        });
      }

      const tx = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!tx || tx.meta?.err) {
        return res.status(400).json({
          error: 'Invalid or failed transaction'
        });
      }

      const usdcMintPk = new PublicKey(process.env.USDC_MINT);
      const recipientAta = await getAssociatedTokenAddress(
        usdcMintPk,
        new PublicKey(process.env.SOLANA_WALLET_ADDRESS)
      );

      const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;
      const ataIndex = accountKeys.findIndex(
        key => key.toBase58() === recipientAta.toBase58()
      );

      if (ataIndex === -1) {
        return res.status(400).json({
          error: 'Payment recipient mismatch'
        });
      }

      const postTokenBalances = tx.meta.postTokenBalances || [];
      const preTokenBalances = tx.meta.preTokenBalances || [];

      const postBalance = postTokenBalances.find(b => b.accountIndex === ataIndex);
      const preBalance = preTokenBalances.find(b => b.accountIndex === ataIndex);

      if (!postBalance) {
        return res.status(400).json({
          error: 'Token balance information not found'
        });
      }

      const preAmount = preBalance ? parseFloat(preBalance.uiTokenAmount.uiAmount) : 0;
      const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmount);
      const amountTransferred = postAmount - preAmount;
      const expectedUSDC = parseFloat(requiredAmount);

      if (amountTransferred < expectedUSDC) {
        return res.status(400).json({
          error: 'Insufficient payment amount'
        });
      }

      // Attempt to infer payer address: find a USDC token account that decreased
      let payerAddress = null;
      try {
        const candidates = [];
        for (const pre of preTokenBalances) {
          const post = postTokenBalances.find(b => b.accountIndex === pre.accountIndex);
          if (!post) continue;
          const preAmt = parseFloat(pre.uiTokenAmount.uiAmount);
          const postAmt = parseFloat(post.uiTokenAmount.uiAmount);
          if (postAmt < preAmt && pre.mint === usdcMintPk.toBase58()) {
            candidates.push({ owner: pre.owner, delta: preAmt - postAmt });
          }
        }
        if (candidates.length > 0) {
          // Choose the largest decrease as payer
          candidates.sort((a, b) => b.delta - a.delta);
          payerAddress = candidates[0].owner || null;
        }
      } catch {}

      req.payment = {
        verified: true,
        signature,
        amount: amountTransferred,
        timestamp: tx.blockTime,
        token: 'USDC',
        payer: payerAddress
      };

      next();

    } catch (error) {
      console.error('x402 middleware error:', error);
      res.status(400).json({
        error: 'Invalid payment data',
        details: error.message
      });
    }
  };
};
