import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createGift, updateGift } from "@/lib/gifts";
import { createOrder, getOutcomeMints, USDC_MINT, getOrderStatus } from "@/lib/dflow";
import { signAndSendDFlowTransaction, confirmTransaction, getServerKeypair } from "@/lib/solana";

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
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") || "";

    let event: Stripe.Event;

    // Verify webhook signature (skip in demo mode without secret)
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err: any) {
        console.error("[Webhook] Signature verification failed:", err.message);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    } else {
      // No webhook secret - parse body directly (for testing)
      event = JSON.parse(body);
    }

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      if (session.payment_status === "paid") {
        await handleSuccessfulPayment(session);
      }
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
  } = metadata;

  console.log("[Webhook] Processing gift purchase:", {
    marketTicker,
    side,
    shares,
    recipientEmail,
    demoMode: isDemoMode,
  });

  try {
    let outputMint = "demo-mint-" + Date.now();
    let purchaseTxSig = "demo-tx-" + Date.now();
    let tokensReceived = parseInt(shares) || 10;

    if (isDemoMode) {
      // ─── DEMO MODE: Simulate the purchase ───────────────────
      console.log("[Webhook] DEMO MODE - Simulating DFlow purchase");
      
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
      const { yesMint, noMint } = await getOutcomeMints(marketTicker);
      outputMint = side === "yes" ? yesMint : noMint;

      const serverKeypair = getServerKeypair();
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

      // Wait for fill
      let filled = false;
      if (orderResponse.executionMode === "sync") {
        await confirmTransaction(purchaseTxSig);
        filled = true;
      } else {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const status = await getOrderStatus(purchaseTxSig);
            if (status.status === "filled") {
              filled = true;
              break;
            }
          } catch {
            // Keep polling
          }
        }
      }

      if (!filled) {
        console.error("[Webhook] DFlow order not filled");
        // TODO: Refund via Stripe
        return;
      }

      tokensReceived = parseInt(orderResponse.quote.outputAmount || shares);
    }

    // Create gift record
    const gift = await createGift({
      marketTicker,
      marketTitle: marketTitle || marketTicker,
      side: side as "yes" | "no",
      outcomeMint: outputMint,
      tokenAmount: tokensReceived,
      costUSDC: parseFloat(shares) * parseFloat(pricePerShare),
      senderPrivyId: senderEmail || "stripe-" + session.id,
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

    // Use the request origin for internal API calls, or fall back to appUrl
    const apiBase = appUrl;

    try {
      const emailRes = await fetch(`${apiBase}/api/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          recipientName,
          senderName: senderEmail?.split("@")[0] || "A friend",
          marketTitle,
          side,
          shares: tokensReceived,
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
    
  } catch (error) {
    console.error("[Webhook] Failed to process gift:", error);
  }
}
