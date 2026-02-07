import { NextResponse } from "next/server";
import { getGift, updateGift } from "@/lib/gifts";
import { transferOutcomeTokens } from "@/lib/solana";

const isDemoMode = process.env.DEMO_MODE === "true";

/**
 * POST /api/gift/claim
 *
 * Called when recipient signs in via Privy and claims their gift.
 * Transfers outcome tokens from server wallet to recipient's wallet.
 *
 * Body: {
 *   giftId: string,
 *   recipientWalletAddress: string,
 *   recipientPrivyId?: string,
 * }
 */
export async function POST(req: Request) {
  try {
    const { giftId, recipientWalletAddress, recipientPrivyId } =
      await req.json();

    if (!giftId || !recipientWalletAddress) {
      return NextResponse.json(
        { error: "Missing giftId or recipientWalletAddress" },
        { status: 400 }
      );
    }

    // Look up the gift
    const gift = await getGift(giftId);

    if (!gift) {
      return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    }

    if (gift.status !== "pending_claim") {
      return NextResponse.json(
        {
          error: `Gift cannot be claimed (status: ${gift.status})`,
          status: gift.status,
        },
        { status: 400 }
      );
    }

    let signature = "demo-claim-tx-" + Date.now();

    if (isDemoMode) {
      // ─── DEMO MODE: Simulate the transfer ───────────────────
      console.log("[Claim] DEMO MODE - Simulating token transfer");
      await new Promise((r) => setTimeout(r, 1500)); // Simulate processing
    } else {
      // ─── PRODUCTION MODE: Real token transfer ───────────────
      signature = await transferOutcomeTokens({
        outcomeMint: gift.outcomeMint,
        recipientAddress: recipientWalletAddress,
        amount: gift.tokenAmount,
      });
    }

    // Update gift record
    await updateGift(giftId, {
      status: "claimed",
      claimTxSig: signature,
      claimedAt: new Date(),
      recipientWalletAddress,
      recipientPrivyId,
    });

    console.log("[Claim] Gift claimed:", { giftId, demoMode: isDemoMode });

    return NextResponse.json({
      success: true,
      signature,
      recipientWalletAddress,
    });
  } catch (error: any) {
    console.error("[/api/gift/claim] Error:", error);
    return NextResponse.json(
      { error: error.message || "Claim failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gift/claim?id=xxx
 *
 * Get gift details for the claim page (public, no auth required).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const giftId = searchParams.get("id");

  if (!giftId) {
    return NextResponse.json({ error: "Missing gift id" }, { status: 400 });
  }

  const gift = await getGift(giftId);
  if (!gift) {
    return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  }

  // Return public-safe gift info (no sender privy ID, no wallet keys)
  return NextResponse.json({
    id: gift.id,
    marketTicker: gift.marketTicker,
    marketTitle: gift.marketTitle,
    side: gift.side,
    tokenAmount: gift.tokenAmount,
    costUSDC: gift.costUSDC,
    senderName: "Someone", // Don't expose sender details publicly
    recipientName: gift.recipientName,
    giftMessage: gift.giftMessage,
    status: gift.status,
    createdAt: gift.createdAt,
  });
}
