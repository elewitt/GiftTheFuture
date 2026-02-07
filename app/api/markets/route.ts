import { NextResponse } from "next/server";
import { getMarkets, searchMarkets, getTrendingMarkets, transformMarket } from "@/lib/kalshi";

/**
 * GET /api/markets
 * 
 * Fetch markets from Kalshi API.
 * 
 * Query params:
 * - q: search query (optional)
 * - trending: if "true", return trending markets sorted by volume
 * - limit: number of results (default 30)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const trending = searchParams.get("trending") === "true";
    const limit = parseInt(searchParams.get("limit") || "30");

    let markets;

    if (query) {
      // Search mode
      const results = await searchMarkets(query);
      markets = results.slice(0, limit).map(transformMarket);
    } else if (trending) {
      // Trending mode (sorted by 24h volume)
      const results = await getTrendingMarkets(limit);
      markets = results.map(transformMarket);
    } else {
      // Default: get open markets sorted by volume
      const { markets: raw } = await getMarkets({ limit });
      markets = raw.map(transformMarket);
    }

    return NextResponse.json({
      markets,
      count: markets.length,
      source: "kalshi",
    });
  } catch (error: any) {
    console.error("[/api/markets] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch markets", markets: [] },
      { status: 500 }
    );
  }
}
