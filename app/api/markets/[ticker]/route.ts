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
 * GET /api/markets/[ticker]
 *
 * Fetch a single market from DFlow by ticker.
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

    const res = await fetch(`${DFLOW_API}/api/v1/market/${encodeURIComponent(ticker)}`, {
      headers: getHeaders(),
      next: { revalidate: 10 },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: "Market not found" }, { status: 404 });
      }
      throw new Error(`DFlow API error: ${res.status}`);
    }

    const market: DFlowMarketFull = await res.json();

    return NextResponse.json({
      market: transformDFlowMarket(market),
      source: "dflow",
    });
  } catch (error: any) {
    console.error("[/api/markets/[ticker]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch market" },
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
    lastPrice: yesPrice,
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
