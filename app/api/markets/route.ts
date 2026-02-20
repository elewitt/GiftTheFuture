import { NextResponse } from "next/server";

const DFLOW_API = process.env.DFLOW_METADATA_API || "https://d.prediction-markets-api.dflow.net";

function getHeaders(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  const key = process.env.DFLOW_API_KEY;
  if (key) h["x-api-key"] = key;
  return h;
}

interface DFlowMarketFull {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle?: string;
  status: string;
  volume?: number;
  openInterest?: number;
  yesBid?: string;
  yesAsk?: string;
  noBid?: string;
  noAsk?: string;
  closeTime?: number;
  expirationTime?: number;
}

/**
 * GET /api/markets
 *
 * Fetch markets from DFlow API (these are the markets we can actually trade).
 *
 * Query params:
 * - q: search query (optional)
 * - trending: if "true", return markets sorted by volume
 * - limit: number of results (default 30)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "30");

    // Fetch markets from DFlow with full price data
    const res = await fetch(`${DFLOW_API}/api/v1/markets?status=active&limit=200`, {
      headers: getHeaders(),
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      throw new Error(`DFlow API error: ${res.status}`);
    }

    const data = await res.json();
    let allMarkets: DFlowMarketFull[] = data.markets || data || [];

    // Search filter
    if (query) {
      allMarkets = allMarkets.filter(m => {
        const searchText = `${m.title || ""} ${m.ticker || ""} ${m.eventTicker || ""}`.toLowerCase();
        return searchText.includes(query);
      });
    }

    // Sort by volume (highest first)
    allMarkets.sort((a, b) => (b.volume || 0) - (a.volume || 0));

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

function transformDFlowMarket(m: DFlowMarketFull) {
  // DFlow prices are strings like "0.0600"
  const yesBid = parseFloat(m.yesBid || "0.5");
  const yesAsk = parseFloat(m.yesAsk || "0.5");
  const noBid = parseFloat(m.noBid || "0.5");
  const noAsk = parseFloat(m.noAsk || "0.5");

  // Use midpoint of bid/ask for display
  const yesPrice = (yesBid + yesAsk) / 2;
  const noPrice = (noBid + noAsk) / 2;

  return {
    ticker: m.ticker,
    eventTicker: m.eventTicker || m.ticker.split("-").slice(0, -1).join("-") || m.ticker,
    title: m.title || m.ticker,
    subtitle: m.subtitle || "",
    category: extractCategory(m.ticker),
    status: m.status,
    yesPrice,
    noPrice,
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    volume: m.volume || 0,
    volume24h: m.volume || 0,
    openInterest: m.openInterest || 0,
    closeTime: m.closeTime ? new Date(m.closeTime * 1000).toISOString() : "",
    expirationTime: m.expirationTime ? new Date(m.expirationTime * 1000).toISOString() : "",
  };
}

function extractCategory(ticker: string): string {
  if (!ticker) return "Other";
  const t = ticker.toUpperCase();

  if (t.includes("NFL") || t.includes("NBA") || t.includes("MLB") ||
      t.includes("NHL") || t.includes("NCAA") || t.includes("MAR") ||
      t.includes("BOWL") || t.includes("MVP") || t.includes("PGA") ||
      t.includes("PREMIER") || t.includes("OSCAR")) {
    return "Sports";
  }
  if (t.includes("PRES") || t.includes("FED") || t.includes("NOM") ||
      t.includes("TRUMP") || t.includes("DEM") || t.includes("REP") ||
      t.includes("POWELL") || t.includes("KHAMENEI") || t.includes("GREENLAND")) {
    return "Politics";
  }
  if (t.includes("BTC") || t.includes("ETH") || t.includes("CRYPTO")) {
    return "Crypto";
  }
  if (t.includes("EARNINGS")) {
    return "Business";
  }

  return "Other";
}
