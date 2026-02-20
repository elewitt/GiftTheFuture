import { NextResponse } from "next/server";
import { getMarket as getDFlowMarket, DFlowMarket } from "@/lib/dflow";

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

    const market = await getDFlowMarket(ticker);

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

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

function transformDFlowMarket(m: DFlowMarket) {
  const yesPrice = m.yes_price ?? 0.5;
  const noPrice = m.no_price ?? 0.5;

  return {
    ticker: m.ticker,
    eventTicker: m.ticker.split("-")[0] || m.ticker,
    title: m.title || m.ticker,
    subtitle: "",
    category: extractCategory(m.ticker),
    status: m.status,
    yesPrice,
    noPrice,
    yesBid: yesPrice,
    yesAsk: yesPrice,
    noBid: noPrice,
    noAsk: noPrice,
    lastPrice: yesPrice,
    volume: m.volume || 0,
    volume24h: m.volume || 0,
    openInterest: 0,
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
