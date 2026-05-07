import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createGift, updateGift } from "@/lib/gifts";
import { createOrder, getOutcomeMints, USDC_MINT } from "@/lib/dflow";
import {
  signAndSendDFlowTransaction,
  confirmTransaction,
  getServerKeypair,
  transferOutcomeTokens,
  getServerTokenBalance,
} from "@/lib/solana";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia",
});

const isDemoMode = process.env.DEMO_MODE === "true";

/**
 * POST /api/checkout/process
 *
 * Process a completed Stripe checkout session.
 * This is a fallback for when webhooks aren't available (local dev).
 *
 * Body: { sessionId: string }
 */
export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed", status: session.payment_status },
        { status: 400 }
      );
    }

    const metadata = session.metadata || {};
    const {
      marketTicker,
      marketTitle,
      side,
      shares,
      pricePerShare,
      recipientEmail,
      recipientName,
      giftMessage,
      senderEmail,
      senderPrivyId,
      isSelfPurchase,
      userWalletAddress,
    } = metadata;

    const selfPurchase = isSelfPurchase === "true";

    console.log("[Process] Processing checkout:", {
      sessionId,
      marketTicker,
      side,
      selfPurchase,
      userWalletAddress: selfPurchase ? userWalletAddress : "(gift mode)",
    });

    const TOKEN_DECIMALS = 6;
    const sharesNum = parseFloat(shares) || 10;

    let outputMint = "demo-mint-" + Date.now();
    let purchaseTxSig = "demo-tx-" + Date.now();
    let tokensReceived = Math.floor(sharesNum * Math.pow(10, TOKEN_DECIMALS));

    if (isDemoMode) {
      console.log("[Process] DEMO MODE - Simulating purchase");
      try {
        const mints = await getOutcomeMints(marketTicker);
        outputMint = side === "yes" ? mints.yesMint : mints.noMint;
      } catch {
        outputMint = `demo-${side}-mint-${marketTicker}`;
      }
    } else {
      // Real purchase via DFlow
      console.log("[Process] Executing DFlow purchase...");

      const serverKeypair = getServerKeypair();
      const { yesMint, noMint } = await getOutcomeMints(marketTicker);
      outputMint = side === "yes" ? yesMint : noMint;

      const amountUSDC = parseFloat(shares) * parseFloat(pricePerShare);
      const amountLamports = Math.floor(amountUSDC * 1_000_000);

      const orderResponse = await createOrder({
        inputMint: USDC_MINT,
        outputMint,
        amount: amountLamports,
        slippageBps: 50,
        userPublicKey: serverKeypair.publicKey.toBase58(),
      });

      purchaseTxSig = await signAndSendDFlowTransaction(orderResponse.transaction);
      await confirmTransaction(purchaseTxSig);

      const rawOutAmount = Number(orderResponse.outAmount);
      if (rawOutAmount > 0) {
        tokensReceived = rawOutAmount;
      }

      console.log("[Process] Purchase complete:", purchaseTxSig);
    }

    // Handle self-purchase vs gift mode
    if (selfPurchase && userWalletAddress) {
      console.log("[Process] Self-purchase - transferring to:", userWalletAddress);
      console.log("[Process] Output mint:", outputMint);
      console.log("[Process] Tokens to transfer:", tokensReceived);

      if (!isDemoMode) {
        // Wait a moment for async order to settle, then check balance
        let retries = 5;
        let serverBalance = 0;

        while (retries > 0) {
          await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
          serverBalance = await getServerTokenBalance(outputMint);
          console.log("[Process] Server token balance:", serverBalance);

          if (serverBalance >= tokensReceived) {
            break;
          }
          retries--;
          console.log("[Process] Waiting for tokens to settle, retries left:", retries);
        }

        if (serverBalance < tokensReceived) {
          // Use actual balance if less than expected
          console.log("[Process] Using actual balance:", serverBalance);
          tokensReceived = serverBalance;
        }

        if (tokensReceived > 0) {
          const transferSig = await transferOutcomeTokens({
            outcomeMint: outputMint,
            recipientAddress: userWalletAddress,
            amount: tokensReceived,
          });
          console.log("[Process] Transfer complete:", transferSig);
        } else {
          console.log("[Process] No tokens to transfer");
          return NextResponse.json({
            success: false,
            error: "Tokens not yet available. Please check your dashboard later.",
          }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        mode: "self-purchase",
        tokensReceived: tokensReceived / Math.pow(10, TOKEN_DECIMALS),
        walletAddress: userWalletAddress,
      });
    } else {
      // Gift mode - create gift record
      const gift = await createGift({
        marketTicker,
        marketTitle: marketTitle || marketTicker,
        side: side as "yes" | "no",
        outcomeMint: outputMint,
        tokenAmount: tokensReceived,
        costUSDC: parseFloat(shares) * parseFloat(pricePerShare),
        senderPrivyId: senderPrivyId || senderEmail || "stripe-" + session.id,
        recipientName: recipientName || "",
        recipientContact: recipientEmail,
        giftMessage: giftMessage || "",
      });

      await updateGift(gift.id, {
        status: "pending_claim",
        purchaseTxSig,
        tokenAmount: tokensReceived,
      });

      // Send claim email
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const claimUrl = `${appUrl}/gift/${gift.id}`;

      try {
        const displayShares = tokensReceived / Math.pow(10, TOKEN_DECIMALS);
        await fetch(`${appUrl}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipientEmail,
            recipientName,
            senderName: senderEmail?.split("@")[0] || "A friend",
            marketTitle,
            side,
            shares: displayShares,
            giftMessage,
            claimUrl,
          }),
        });
      } catch (emailErr) {
        console.error("[Process] Email failed:", emailErr);
      }

      return NextResponse.json({
        success: true,
        mode: "gift",
        giftId: gift.id,
        claimUrl,
      });
    }
  } catch (error: any) {
    console.error("[/api/checkout/process] Error:", error);
    return NextResponse.json(
      { error: error.message || "Processing failed" },
      { status: 500 }
    );
  }
}
