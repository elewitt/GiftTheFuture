import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createGift, updateGift } from "@/lib/gifts";
import { createOrder, getOutcomeMints, USDC_MINT } from "@/lib/dflow";
import { signAndSendDFlowTransaction, confirmTransaction, getServerKeypair, transferOutcomeTokens } from "@/lib/solana";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const isDemoMode = process.env.DEMO_MODE === "true";

/**
 * POST /api/checkout/webhook
 * 
 * Stripe webhook handler. When payment succeeds:
 * 1. Buy the position via DFlow (or simulate in demo mode)
 * 2. Create the gift record
 * 3. Send the claim email
 */
export async function POST(req: Request) {
  console.log("[Webhook] ====== WEBHOOK RECEIVED ======");
  console.log("[Webhook] DEMO_MODE:", isDemoMode);
  console.log("[Webhook] Has webhook secret:", !!webhookSecret);

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") || "";

    let event: Stripe.Event;

    // Verify webhook signature (skip in demo mode without secret)
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        console.log("[Webhook] Signature verified successfully");
      } catch (err: any) {
        console.error("[Webhook] Signature verification failed:", err.message);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    } else {
      // No webhook secret - parse body directly (for testing)
      console.log("[Webhook] No webhook secret, parsing body directly");
      event = JSON.parse(body);
    }

    console.log("[Webhook] Event type:", event.type);

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("[Webhook] Payment status:", session.payment_status);
      console.log("[Webhook] Session metadata:", session.metadata);

      if (session.payment_status === "paid") {
        console.log("[Webhook] Payment confirmed, processing gift...");
        await handleSuccessfulPayment(session);
      } else {
        console.log("[Webhook] Payment not yet paid, skipping");
      }
    } else {
      console.log("[Webhook] Ignoring event type:", event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[/api/checkout/webhook] Error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
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

  console.log("[Webhook] Processing purchase:", {
    marketTicker,
    side,
    shares,
    recipientEmail,
    selfPurchase,
    userWalletAddress: selfPurchase ? userWalletAddress : "(gift mode)",
    demoMode: isDemoMode,
  });

  // Token amount is stored in raw units (6 decimals)
  // e.g., 10 shares = 10,000,000 raw units
  const TOKEN_DECIMALS = 6;
  const sharesNum = parseFloat(shares) || 10;

  try {
    let outputMint = "demo-mint-" + Date.now();
    let purchaseTxSig = "demo-tx-" + Date.now();
    // Initialize with raw token units (shares * 10^6)
    let tokensReceived = Math.floor(sharesNum * Math.pow(10, TOKEN_DECIMALS));

    if (isDemoMode) {
      // ─── DEMO MODE: Simulate the purchase ───────────────────
      console.log("[Webhook] ⚠️ DEMO MODE ACTIVE - Simulating DFlow purchase (no real transaction)");
      console.log("[Webhook] To enable real purchases, set DEMO_MODE=false in Vercel env vars");
      console.log("[Webhook] Shares:", sharesNum, "-> Raw tokens:", tokensReceived);

      // Try to get real mint addresses for display purposes
      try {
        const mints = await getOutcomeMints(marketTicker);
        outputMint = side === "yes" ? mints.yesMint : mints.noMint;
      } catch {
        outputMint = `demo-${side}-mint-${marketTicker}`;
      }

      // Simulate some processing time
      await new Promise((r) => setTimeout(r, 1000));

    } else {
      // ─── PRODUCTION MODE: Real DFlow purchase ───────────────
      console.log("[Webhook] 🚀 PRODUCTION MODE - Executing real DFlow purchase");

      try {
        // Check if server wallet is KYC verified with Proof
        const serverKeypair = getServerKeypair();
        const serverWallet = serverKeypair.publicKey.toBase58();
        console.log("[Webhook] Server wallet:", serverWallet);

        try {
          const kycRes = await fetch(`https://proof.dflow.net/verify/${serverWallet}`);
          const kycData = await kycRes.json();
          console.log("[Webhook] KYC status:", kycData);

          if (!kycData.verified) {
            throw new Error(`Server wallet ${serverWallet} is not KYC verified with Proof. Complete verification at https://proof.dflow.net`);
          }
        } catch (kycErr: any) {
          if (kycErr.message?.includes("not KYC verified")) {
            throw kycErr; // Re-throw our custom error
          }
          console.warn("[Webhook] Could not check KYC status:", kycErr.message);
          // Continue anyway - let DFlow reject if needed
        }

        console.log("[Webhook] Getting outcome mints for:", marketTicker);
        const { yesMint, noMint } = await getOutcomeMints(marketTicker);
        outputMint = side === "yes" ? yesMint : noMint;
        console.log("[Webhook] Output mint:", outputMint);

        const amountUSDC = parseFloat(shares) * parseFloat(pricePerShare);
        const amountLamports = Math.floor(amountUSDC * 1_000_000);
        console.log("[Webhook] Amount USDC:", amountUSDC, "lamports:", amountLamports);

        console.log("[Webhook] Creating DFlow order...");
        const orderResponse = await createOrder({
          inputMint: USDC_MINT,
          outputMint,
          amount: amountLamports,
          slippageBps: 50,
          userPublicKey: serverKeypair.publicKey.toBase58(),
        });
        console.log("[Webhook] Order created, out amount:", orderResponse.outAmount);

        console.log("[Webhook] Signing and sending transaction...");
        purchaseTxSig = await signAndSendDFlowTransaction(orderResponse.transaction);
        console.log("[Webhook] Transaction sent:", purchaseTxSig);

        // Wait for on-chain confirmation
        console.log("[Webhook] Waiting for confirmation...");
        await confirmTransaction(purchaseTxSig);
        console.log("[Webhook] ✅ Transaction confirmed:", purchaseTxSig);

        // outAmount from DFlow is already in raw token units (6 decimals)
        const rawOutAmount = Number(orderResponse.outAmount);
        if (rawOutAmount > 0) {
          tokensReceived = rawOutAmount;
        }
        console.log("[Webhook] Tokens received (raw):", tokensReceived);
      } catch (txErr: any) {
        console.error("[Webhook] ❌ DFlow transaction failed:", txErr.message || txErr);
        console.error("[Webhook] Full error:", JSON.stringify(txErr, null, 2));

        // Create gift record marked as FAILED - do not mark as claimable
        const failedGift = await createGift({
          marketTicker,
          marketTitle: marketTitle || marketTicker,
          side: side as "yes" | "no",
          outcomeMint: outputMint,
          tokenAmount: 0, // No tokens were purchased
          costUSDC: parseFloat(shares) * parseFloat(pricePerShare),
          senderPrivyId: senderPrivyId || senderEmail || "stripe-" + session.id,
          recipientName: recipientName || "",
          recipientContact: recipientEmail,
          giftMessage: giftMessage || "",
        });

        await updateGift(failedGift.id, {
          status: "failed",
          purchaseTxSig: "FAILED-" + Date.now(),
          tokenAmount: 0,
        });

        console.error("[Webhook] Gift marked as failed:", failedGift.id);
        console.error("[Webhook] ⚠️ IMPORTANT: The DFlow purchase failed. This is likely because the server wallet is not KYC verified with Proof.");
        console.error("[Webhook] To fix: Complete KYC at https://proof.dflow.net for wallet:", process.env.SERVER_WALLET_PUBLIC_KEY || "(check Vercel env vars)");

        // TODO: Send failure notification email to sender
        // TODO: Initiate Stripe refund

        return; // Exit early - don't proceed with success flow
      }
    }

    // Handle self-purchase vs gift mode
    if (selfPurchase && userWalletAddress) {
      // ─── SELF-PURCHASE: Transfer tokens directly to user's wallet ───
      console.log("[Webhook] Self-purchase mode - transferring tokens to:", userWalletAddress);

      if (!isDemoMode) {
        try {
          const transferSig = await transferOutcomeTokens({
            outcomeMint: outputMint,
            recipientAddress: userWalletAddress,
            amount: tokensReceived,
          });
          console.log("[Webhook] ✅ Tokens transferred to user wallet:", transferSig);
        } catch (transferErr: any) {
          console.error("[Webhook] ❌ Token transfer failed:", transferErr.message);
          // Tokens are still in server wallet - user can contact support
        }
      } else {
        console.log("[Webhook] ⚠️ DEMO MODE - Skipping actual token transfer");
      }

      console.log("[Webhook] Self-purchase completed:", {
        marketTicker,
        side,
        tokensReceived: tokensReceived / Math.pow(10, TOKEN_DECIMALS),
        userWallet: userWalletAddress,
      });
    } else {
      // ─── GIFT MODE: Create gift record and send email ───
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

      // Update to pending_claim
      await updateGift(gift.id, {
        status: "pending_claim",
        purchaseTxSig,
        tokenAmount: tokensReceived,
      });

      // Send claim email
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
      const claimUrl = `${appUrl}/gift/${gift.id}`;
      console.log("[Webhook] Sending claim email to:", recipientEmail);
      console.log("[Webhook] Claim URL:", claimUrl);
      console.log("[Webhook] RESEND_FROM_EMAIL:", process.env.RESEND_FROM_EMAIL || "(not set - using test domain)");

      // Use the request origin for internal API calls, or fall back to appUrl
      const apiBase = appUrl;

      try {
        console.log("[Webhook] Calling email API at:", `${apiBase}/api/email/send`);
        // For email, use display amount (human-readable shares)
        const displayShares = tokensReceived / Math.pow(10, TOKEN_DECIMALS);
        const emailRes = await fetch(`${apiBase}/api/email/send`, {
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

        if (!emailRes.ok) {
          const errData = await emailRes.json().catch(() => ({}));
          console.error("[Webhook] Email API error:", errData);
        } else {
          console.log("[Webhook] Claim email sent to:", recipientEmail);
        }
      } catch (emailErr) {
        console.error("[Webhook] Email send failed:", emailErr);
      }

      console.log("[Webhook] Gift created successfully:", {
        giftId: gift.id,
        claimUrl,
        demoMode: isDemoMode,
      });
    }
    
  } catch (error) {
    console.error("[Webhook] Failed to process gift:", error);
  }
}
