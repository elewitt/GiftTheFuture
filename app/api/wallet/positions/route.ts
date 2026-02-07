import { NextResponse } from "next/server";
import { getPositions } from "@/lib/solana";

/**
 * GET /api/wallet/positions?address=xxx
 * 
 * Returns all prediction market positions for a wallet.
 * Queries SPL token accounts and cross-references with DFlow Metadata API.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const positions = await getPositions(address);

    // Enrich with current prices (in production, you'd call DFlow's price API)
    const enrichedPositions = positions.map((p) => ({
      ...p,
      currentPrice: 0.5, // Default to 50% if no price data
      currentValue: p.balance * 0.5,
    }));

    return NextResponse.json({
      address,
      positions: enrichedPositions,
      count: enrichedPositions.length,
    });
  } catch (error: any) {
    console.error("[/api/wallet/positions] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
