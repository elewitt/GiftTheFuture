import { NextResponse } from "next/server";
import { createRedemptionOrder, getMarketByMint } from "@/lib/dflow";
import { getTokenBalance } from "@/lib/solana";

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

    console.log("[/api/gift/redeem] Request:", { outcomeMint, amount, userPublicKey });

    if (!outcomeMint || !amount || !userPublicKey) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user actually has the tokens
    const balance = await getTokenBalance(userPublicKey, outcomeMint);
    console.log("[/api/gift/redeem] User token balance:", balance, "requested:", amount);

    if (balance <= 0) {
      return NextResponse.json(
        { error: "No tokens found in your wallet. The claim may not have completed successfully." },
        { status: 400 }
      );
    }

    if (balance < amount) {
      return NextResponse.json(
        { error: `Insufficient balance. You have ${balance} tokens but tried to sell ${amount}.` },
        { status: 400 }
      );
    }

    // Check if the market is still active
    const market = await getMarketByMint(outcomeMint);
    console.log("[/api/gift/redeem] Market lookup:", market);

    if (market && market.status !== "active" && market.status !== "open") {
      return NextResponse.json(
        { error: `Market is ${market.status}. Cashout is only available for active markets.` },
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

    console.log("[/api/gift/redeem] Order created:", {
      executionMode: order.executionMode,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
    });

    return NextResponse.json({
      transaction: order.transaction,
      executionMode: order.executionMode,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
      minOutAmount: order.minOutAmount,
    });
  } catch (error: any) {
    console.error("[/api/gift/redeem] Error:", error.message);

    // Provide more helpful error messages
    if (error.message?.includes("route_not_found")) {
      return NextResponse.json(
        { error: "No liquidity available. The market may be closed or have insufficient trading volume." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Redemption failed" },
      { status: 500 }
    );
  }
}
