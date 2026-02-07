import { NextResponse } from "next/server";
import { createGift, updateGift } from "@/lib/gifts";

/**
 * POST /api/demo/create-gift
 * 
 * Creates a demo gift without going through Stripe or DFlow.
 * Only works when DEMO_MODE=true.
 * 
 * This lets you test the entire recipient flow:
 * 1. Call this endpoint to create a gift
 * 2. Get the claim URL
 * 3. Open it in a new browser / incognito
 * 4. Sign in as recipient
 * 5. See the claim flow
 */
export async function POST(req: Request) {
  const isDemoMode = process.env.DEMO_MODE === "true";
  
  if (!isDemoMode) {
    return NextResponse.json(
      { error: "Demo mode is not enabled. Set DEMO_MODE=true in .env.local" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      marketTicker = "DEMO-MARKET",
      marketTitle = "Will this demo work?",
      side = "yes",
      shares = 10,
      recipientEmail = "demo@example.com",
      recipientName = "Demo Recipient",
      giftMessage = "This is a demo gift! 🎁",
    } = body;

    // Create demo gift
    const gift = await createGift({
      marketTicker,
      marketTitle,
      side: side as "yes" | "no",
      outcomeMint: `demo-${side}-mint-${Date.now()}`,
      tokenAmount: shares,
      costUSDC: shares * 0.5, // Assume 50 cent price
      senderPrivyId: "demo-sender",
      recipientName,
      recipientContact: recipientEmail,
      giftMessage,
    });

    // Mark as ready to claim
    await updateGift(gift.id, {
      status: "pending_claim",
      purchaseTxSig: "demo-purchase-tx-" + Date.now(),
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const claimUrl = `${appUrl}/gift/${gift.id}`;

    console.log("[Demo] Gift created:", { giftId: gift.id, claimUrl });

    return NextResponse.json({
      success: true,
      giftId: gift.id,
      claimUrl,
      gift: {
        marketTitle,
        side,
        shares,
        recipientEmail,
        recipientName,
        giftMessage,
      },
    });
  } catch (error: any) {
    console.error("[/api/demo/create-gift] Error:", error);
    return NextResponse.json(
      { error: error.message || "Demo gift creation failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/demo/create-gift
 * 
 * Quick way to create a demo gift from the browser.
 */
export async function GET() {
  const isDemoMode = process.env.DEMO_MODE === "true";
  
  if (!isDemoMode) {
    return NextResponse.json(
      { error: "Demo mode is not enabled. Set DEMO_MODE=true in .env.local" },
      { status: 403 }
    );
  }

  // Create a demo gift with defaults
  const gift = await createGift({
    marketTicker: "KXSB-26-LAC",
    marketTitle: "Will the Los Angeles Chargers win the 2026 Pro Football Championship?",
    side: "yes",
    outcomeMint: `demo-yes-mint-${Date.now()}`,
    tokenAmount: 25,
    costUSDC: 3.50,
    senderPrivyId: "demo-sender",
    recipientName: "Demo User",
    recipientContact: "demo@example.com",
    giftMessage: "Go team! This is a demo gift to test the claim flow.",
  });

  await updateGift(gift.id, {
    status: "pending_claim",
    purchaseTxSig: "demo-purchase-tx-" + Date.now(),
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const claimUrl = `${appUrl}/gift/${gift.id}`;

  // Return HTML for easy testing
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Demo Gift Created</title>
<style>
body { 
  font-family: system-ui, sans-serif; 
  background: #060a13; 
  color: #e2e8f0; 
  padding: 40px;
  max-width: 600px;
  margin: 0 auto;
}
h1 { color: #34d399; }
a { 
  display: inline-block;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: bold;
  margin: 20px 0;
}
code {
  background: #1e293b;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 14px;
}
.info {
  background: #1e293b;
  padding: 20px;
  border-radius: 12px;
  margin: 20px 0;
}
</style>
</head>
<body>
<h1>Demo Gift Created!</h1>
<p>Gift ID: <code>${gift.id}</code></p>

<div class="info">
  <p><strong>Market:</strong> ${gift.marketTitle}</p>
  <p><strong>Position:</strong> ${gift.tokenAmount} x YES</p>
  <p><strong>Message:</strong> "${gift.giftMessage}"</p>
</div>

<p>Open this link in an incognito window to test the recipient experience:</p>
<a href="${claimUrl}" target="_blank">Open Claim Page</a>

<p style="margin-top: 40px; color: #64748b; font-size: 14px;">
  Tip: Use incognito so you can sign in as a different user (the recipient).
</p>
</body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
