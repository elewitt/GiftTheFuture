import { NextResponse } from "next/server";
import { createRedemptionOrder } from "@/lib/dflow";

/**
 * POST /api/gift/redeem
 *
 * Returns an unsigned transaction for selling outcome tokens.
 * The recipient signs this via their Privy embedded wallet.
 *
 * Body: {
 *   outcomeMint: string,
 *   amount: number,
 *   userPublicKey: string,  // Recipient's wallet address
 * }
 */
export async function POST(req: Request) {
  try {
    const { outcomeMint, amount, userPublicKey } = await req.json();

    if (!outcomeMint || !amount || !userPublicKey) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get redemption order from DFlow
    // This sells outcome tokens → USDC
    const order = await createRedemptionOrder({
      outcomeMint,
      amount,
      userPublicKey,
    });

    return NextResponse.json({
      transaction: order.transaction,
      executionMode: order.executionMode,
      quote: order.quote,
    });
  } catch (error: any) {
    console.error("[/api/gift/redeem] Error:", error);
    return NextResponse.json(
      { error: error.message || "Redemption failed" },
      { status: 500 }
    );
  }
}
