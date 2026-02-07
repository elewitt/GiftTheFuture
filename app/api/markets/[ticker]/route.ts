import { NextResponse } from "next/server";
import { getMarket, transformMarket } from "@/lib/kalshi";

/**
 * GET /api/markets/[ticker]
 * 
 * Fetch a single market from Kalshi by ticker.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    
    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const market = await getMarket(ticker);
    
    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    return NextResponse.json({
      market: transformMarket(market),
      source: "kalshi",
    });
  } catch (error: any) {
    console.error("[/api/markets/[ticker]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch market" },
      { status: 500 }
    );
  }
}
