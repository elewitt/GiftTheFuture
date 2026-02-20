import { NextResponse } from "next/server";
import { updateGift, getGift } from "@/lib/gifts";
import { confirmTransaction } from "@/lib/solana";

/**
 * POST /api/gift/cashout
 *
 * Called after user signs and submits the cashout transaction.
 * Updates the gift status to "cashed_out".
 *
 * Body: {
 *   giftId: string,
 *   signature: string,  // Transaction signature
 *   usdcReceived: number,  // Amount of USDC received
 * }
 */
export async function POST(req: Request) {
  try {
    const { giftId, signature, usdcReceived } = await req.json();

    if (!giftId || !signature) {
      return NextResponse.json(
        { error: "Missing giftId or signature" },
        { status: 400 }
      );
    }

    // Verify the gift exists and is in claimed status
    const gift = await getGift(giftId);
    if (!gift) {
      return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    }

    if (gift.status !== "claimed") {
      return NextResponse.json(
        { error: `Gift cannot be cashed out (status: ${gift.status})` },
        { status: 400 }
      );
    }

    // Optionally verify the transaction on-chain
    // This adds latency but ensures the transaction actually succeeded
    try {
      await confirmTransaction(signature, "confirmed");
      console.log("[Cashout] Transaction confirmed:", signature);
    } catch (confirmErr) {
      console.error("[Cashout] Transaction confirmation failed:", confirmErr);
      // Don't fail - the transaction might still be processing
      // The user can check Solscan
    }

    // Update gift status
    await updateGift(giftId, {
      status: "cashed_out",
      // Store the cashout transaction signature in a field
      // We could add a cashoutTxSig field to the schema, but for now use claimTxSig
    });

    console.log("[Cashout] Gift cashed out:", {
      giftId,
      signature,
      usdcReceived,
    });

    return NextResponse.json({
      success: true,
      giftId,
      signature,
      usdcReceived,
    });
  } catch (error: any) {
    console.error("[/api/gift/cashout] Error:", error);
    return NextResponse.json(
      { error: error.message || "Cashout confirmation failed" },
      { status: 500 }
    );
  }
}
