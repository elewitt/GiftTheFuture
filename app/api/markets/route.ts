import { NextResponse } from "next/server";
import { getActiveEvents, DFlowEvent, DFlowMarket } from "@/lib/dflow";

/**
 * GET /api/markets
 *
 * Fetch markets from DFlow API (these are the markets we can actually trade).
 *
 * Query params:
 * - q: search query (optional)
 * - trending: if "true", return all markets (DFlow markets are already curated)
 * - limit: number of results (default 30)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "30");

    // Fetch all DFlow events with nested markets
    const events = await getActiveEvents(100);

    // Flatten markets from all events
    let allMarkets: Array<DFlowMarket & { eventTitle?: string; category?: string }> = [];

    for (const event of events) {
      if (event.markets) {
        for (const market of event.markets) {
          allMarkets.push({
            ...market,
            eventTitle: event.title,
            category: event.category || extractCategory(event.ticker),
          });
        }
      }
    }

    // Search filter
    if (query) {
      allMarkets = allMarkets.filter(m => {
        const searchText = `${m.title || ""} ${m.eventTitle || ""} ${m.ticker || ""}`.toLowerCase();
        return searchText.includes(query);
      });
    }

    // Transform to consistent format
    const markets = allMarkets.slice(0, limit).map(transformDFlowMarket);

    return NextResponse.json({
      markets,
      count: markets.length,
      source: "dflow",
    });
  } catch (error: any) {
    console.error("[/api/markets] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch markets", markets: [] },
      { status: 500 }
    );
  }
}

function transformDFlowMarket(m: DFlowMarket & { eventTitle?: string; category?: string }) {
  // DFlow prices are decimals (0-1)
  const yesPrice = m.yes_price ?? 0.5;
  const noPrice = m.no_price ?? 0.5;

  return {
    ticker: m.ticker,
    eventTicker: m.ticker.split("-")[0] || m.ticker,
    title: m.title || m.ticker,
    subtitle: m.eventTitle || "",
    category: m.category || "Other",
    status: m.status,
    yesPrice,
    noPrice,
    volume: m.volume || 0,
    volume24h: m.volume || 0,
    closeTime: m.close_time || "",
    expirationTime: m.expiration_time || "",
  };
}

function extractCategory(ticker: string): string {
  if (!ticker) return "Other";
  const t = ticker.toUpperCase();

  if (t.includes("NFL") || t.includes("NBA") || t.includes("MLB") ||
      t.includes("NHL") || t.includes("NCAA") || t.includes("MAR") ||
      t.includes("BOWL") || t.includes("MVP")) {
    return "Sports";
  }
  if (t.includes("PRES") || t.includes("FED") || t.includes("NOM") ||
      t.includes("TRUMP") || t.includes("DEM") || t.includes("REP")) {
    return "Politics";
  }
  if (t.includes("BTC") || t.includes("ETH") || t.includes("CRYPTO")) {
    return "Crypto";
  }

  return "Other";
}
