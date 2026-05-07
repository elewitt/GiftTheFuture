import { NextResponse } from "next/server";
import { createOrder, getOutcomeMints, getMarket, USDC_MINT } from "@/lib/dflow";
import {
  getServerKeypair,
  getConnection,
  signAndSendDFlowTransaction,
  confirmTransaction,
  getServerTokenBalance,
} from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

/**
 * GET /api/test/dflow
 *
 * Test the DFlow integration without going through Stripe.
 *
 * Query params:
 * - ticker: Market ticker to test (e.g., "KXNBA-CHAMP-BOS")
 * - side: "yes" or "no" (default: "yes")
 * - amount: USDC amount to spend (default: 1.00)
 * - execute: "true" to actually execute the trade (default: false, just simulates)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const side = searchParams.get("side") || "yes";
  const amount = parseFloat(searchParams.get("amount") || "1");
  const execute = searchParams.get("execute") === "true";

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    params: { ticker, side, amount, execute },
  };

  try {
    // 1. Check server wallet
    const serverKeypair = getServerKeypair();
    const serverWallet = serverKeypair.publicKey.toBase58();
    results.serverWallet = serverWallet;

    // 2. Check server wallet SOL balance (for transaction fees)
    const connection = getConnection();
    const solBalance = await connection.getBalance(new PublicKey(serverWallet));
    results.solBalance = {
      lamports: solBalance,
      sol: solBalance / 1e9,
    };

    // 3. Check server wallet USDC balance
    try {
      const usdcBalance = await getServerTokenBalance(USDC_MINT);
      results.usdcBalance = {
        raw: usdcBalance,
        usdc: usdcBalance / 1e6,
      };
    } catch (e: any) {
      results.usdcBalance = { error: e.message };
    }

    // 4. Check KYC status with Proof
    try {
      const kycRes = await fetch(`https://proof.dflow.net/verify/${serverWallet}`);
      results.kycStatus = await kycRes.json();
    } catch (e: any) {
      results.kycStatus = { error: e.message };
    }

    if (!ticker) {
      results.message = "Provide ?ticker=MARKET_TICKER to test a specific market";
      return NextResponse.json(results);
    }

    // 5. Get market info
    try {
      const market = await getMarket(ticker);
      results.market = {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        yesBid: market.yesBid,
        yesAsk: market.yesAsk,
      };
    } catch (e: any) {
      results.market = { error: e.message };
    }

    // 6. Get outcome mints
    try {
      const mints = await getOutcomeMints(ticker);
      results.outcomeMints = mints;
    } catch (e: any) {
      results.outcomeMints = { error: e.message };
      return NextResponse.json(results);
    }

    // 7. Create order (dry run unless execute=true)
    const outputMint = side === "yes"
      ? results.outcomeMints.yesMint
      : results.outcomeMints.noMint;
    const amountLamports = Math.floor(amount * 1e6);

    results.orderParams = {
      inputMint: USDC_MINT,
      outputMint,
      amount: amountLamports,
      slippageBps: 50,
      userPublicKey: serverWallet,
    };

    try {
      const orderResponse = await createOrder({
        inputMint: USDC_MINT,
        outputMint,
        amount: amountLamports,
        slippageBps: 50,
        userPublicKey: serverWallet,
      });

      results.orderResponse = {
        outAmount: orderResponse.outAmount,
        outAmountHuman: Number(orderResponse.outAmount) / 1e6,
        executionMode: orderResponse.executionMode,
        hasTransaction: !!orderResponse.transaction,
        transactionLength: orderResponse.transaction?.length,
      };

      // 8. Execute trade if requested
      if (execute) {
        results.execution = { status: "executing..." };

        const signature = await signAndSendDFlowTransaction(orderResponse.transaction);
        results.execution.signature = signature;
        results.execution.explorer = `https://solscan.io/tx/${signature}`;

        await confirmTransaction(signature);
        results.execution.status = "confirmed";
        results.execution.tokensReceived = Number(orderResponse.outAmount) / 1e6;
      } else {
        results.execution = {
          status: "skipped",
          message: "Add ?execute=true to actually execute the trade",
        };
      }
    } catch (e: any) {
      results.orderError = {
        message: e.message,
        details: e.response?.data || e.cause || null,
      };
    }

    return NextResponse.json(results);
  } catch (error: any) {
    results.error = error.message;
    return NextResponse.json(results, { status: 500 });
  }
}
