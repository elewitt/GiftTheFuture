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
 * Also fetches sibling markets (same eventTicker) for multi-outcome events.
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

    // Fetch the specific market
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
    const transformedMarket = transformDFlowMarket(market);

    // Fetch sibling markets (same event) if this is part of a multi-outcome event
    let siblingMarkets: ReturnType<typeof transformDFlowMarket>[] = [];

    if (market.eventTicker) {
      try {
        const allMarketsRes = await fetch(`${DFLOW_API}/api/v1/markets?status=active&limit=200`, {
          headers: getHeaders(),
          next: { revalidate: 30 },
        });

        if (allMarketsRes.ok) {
          const data = await allMarketsRes.json();
          const allMarkets: DFlowMarketFull[] = data.markets || data || [];

          // Find markets with the same eventTicker
          const siblings = allMarkets.filter(m =>
            m.eventTicker === market.eventTicker && m.ticker !== market.ticker
          );

          siblingMarkets = siblings.map(transformDFlowMarket);
        }
      } catch (e) {
        console.error("Failed to fetch sibling markets:", e);
      }
    }

    // Determine if this is a multi-outcome event
    const isMultiOutcome = siblingMarkets.length > 0;
    const allOutcomes = isMultiOutcome
      ? [transformedMarket, ...siblingMarkets].sort((a, b) => b.yesPrice - a.yesPrice)
      : [];

    return NextResponse.json({
      market: transformedMarket,
      isMultiOutcome,
      outcomes: allOutcomes,
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
  // Handle null values properly - don't default to 0.5 as that causes incorrect prices
  const yesBidRaw = m.yesBid ? parseFloat(m.yesBid) : null;
  const yesAskRaw = m.yesAsk ? parseFloat(m.yesAsk) : null;
  const noBidRaw = m.noBid ? parseFloat(m.noBid) : null;
  const noAskRaw = m.noAsk ? parseFloat(m.noAsk) : null;

  // Calculate price: use midpoint if both exist, single value if one exists, 0 if neither
  let yesPrice: number;
  if (yesBidRaw !== null && yesAskRaw !== null) {
    yesPrice = (yesBidRaw + yesAskRaw) / 2;
  } else if (yesAskRaw !== null) {
    yesPrice = yesAskRaw;
  } else if (yesBidRaw !== null) {
    yesPrice = yesBidRaw;
  } else {
    yesPrice = 0;
  }

  let noPrice: number;
  if (noBidRaw !== null && noAskRaw !== null) {
    noPrice = (noBidRaw + noAskRaw) / 2;
  } else if (noAskRaw !== null) {
    noPrice = noAskRaw;
  } else if (noBidRaw !== null) {
    noPrice = noBidRaw;
  } else {
    noPrice = 0;
  }

  // Export the parsed values (or 0 if null)
  const yesBid = yesBidRaw ?? 0;
  const yesAsk = yesAskRaw ?? 0;
  const noBid = noBidRaw ?? 0;
  const noAsk = noAskRaw ?? 0;

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

  // Politics (check first - more specific patterns)
  if (t.includes("PRES") || t.includes("FEDCHAIR") || t.includes("NOM") ||
      t.includes("TRUMP") || t.includes("DEM") || t.includes("REP") ||
      t.includes("POWELL") || t.includes("KHAMENEI") || t.includes("GREENLAND") ||
      t.includes("BIDEN") || t.includes("CONGRESS") || t.includes("SENATE") ||
      t.includes("SCOTUS") || t.includes("ELECT") || t.includes("VOTE") ||
      t.includes("GOV") || t.includes("POPE") || t.includes("WAR") ||
      t.includes("UKRAINE") || t.includes("RUSSIA") || t.includes("CHINA") ||
      t.includes("IRAN") || t.includes("ISRAEL") || t.includes("NATO") ||
      t.includes("TARIFF") || t.includes("BORDER") || t.includes("POLICY")) {
    return "Politics";
  }
  // Economics / Crypto
  if (t.includes("CPI") || t.includes("GDP") || t.includes("FOMC") ||
      t.includes("FEDDECISION") || t.includes("RATE") || t.includes("INFLATION") ||
      t.includes("JOBS") || t.includes("UNEMPLOYMENT") || t.includes("RECESSION") ||
      t.includes("DEBT") || t.includes("TREASURY") || t.includes("BOND") ||
      t.includes("STOCK") || t.includes("SPX") || t.includes("SPY") ||
      t.includes("QQQ") || t.includes("DOW") || t.includes("NASDAQ") ||
      t.includes("EARNINGS") || t.includes("BTC") || t.includes("ETH") ||
      t.includes("CRYPTO") || t.includes("OIL") || t.includes("GOLD") ||
      t.includes("SILVER")) {
    return "Economics";
  }
  // Sports (check last - avoid matching dates like "26MAR01")
  if (t.includes("NFL") || t.includes("NBA") || t.includes("MLB") ||
      t.includes("NHL") || t.includes("NCAA") || t.includes("MARMAD") ||
      t.includes("BOWL") || t.includes("MVP") || t.includes("PGA") ||
      t.includes("PREMIER") || t.includes("OSCAR") || t.includes("TENNIS") ||
      t.includes("GOLF") || t.includes("UFC") || t.includes("BOXING") ||
      t.includes("SOCCER") || t.includes("WORLDCUP") || t.includes("OLYMPICS") ||
      t.includes("CHAMPION") || t.includes("PLAYOFF") || t.includes("FINALS")) {
    return "Sports";
  }

  return "Other";
}
