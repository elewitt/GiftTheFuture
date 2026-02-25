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
 * Extract a meaningful label from ticker for multi-outcome events
 */
function getOutcomeLabel(ticker: string, title: string, allMarkets: DFlowMarketFull[]): string {
  // Check if all markets have the same title
  const allSameTitle = allMarkets.every(m => m.title === allMarkets[0]?.title);

  if (!allSameTitle) {
    // Titles are different - use a shortened version
    return title.length > 30 ? title.substring(0, 27) + "..." : title;
  }

  // Titles are the same - extract date from ticker
  const dateMatch = ticker.match(/(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})/i);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const monthNames: Record<string, string> = {
      JAN: "Jan", FEB: "Feb", MAR: "Mar", APR: "Apr",
      MAY: "May", JUN: "Jun", JUL: "Jul", AUG: "Aug",
      SEP: "Sep", OCT: "Oct", NOV: "Nov", DEC: "Dec"
    };
    const monthName = monthNames[month.toUpperCase()] || month;
    return `By ${monthName} ${parseInt(day)}, 20${year}`;
  }

  // Try to extract name from title (e.g., "nominate X as Fed Chair")
  const nameMatch = title.match(/nominate\s+(\w+\s+\w+)/i);
  if (nameMatch) {
    return nameMatch[1];
  }

  // Fallback: last part of ticker
  const parts = ticker.split("-");
  return parts[parts.length - 1] || title.substring(0, 20);
}

/**
 * GET /api/markets
 *
 * Fetch markets from DFlow API (these are the markets we can actually trade).
 *
 * Query params:
 * - q: search query (optional)
 * - category: filter by category (Sports, Politics, Economics)
 * - trending: if "true", return markets sorted by volume
 * - limit: number of results (default 30)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase();
    const category = searchParams.get("category");
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
    } else if (category) {
      // Filter by specific category
      allMarkets = allMarkets.filter(m => {
        const marketCategory = extractCategory(m.ticker);
        return marketCategory === category;
      });
    } else {
      // Default (trending): Focus on sports championship futures
      allMarkets = allMarkets.filter(m => isSportsChampionship(m.ticker, m.title));
    }

    // Sort by volume (highest first)
    allMarkets.sort((a, b) => (b.volume || 0) - (a.volume || 0));

    // Group markets by eventTicker and check if they have the same title
    const eventGroups = new Map<string, DFlowMarketFull[]>();
    allMarkets.forEach(m => {
      const eventKey = m.eventTicker || m.ticker;
      if (!eventGroups.has(eventKey)) {
        eventGroups.set(eventKey, []);
      }
      eventGroups.get(eventKey)!.push(m);
    });

    // Determine which events are true multi-outcome (same title across all markets)
    const trueMultiOutcomeEvents = new Set<string>();
    eventGroups.forEach((markets, eventKey) => {
      if (markets.length > 1 && markets.every(m => m.title === markets[0].title)) {
        trueMultiOutcomeEvents.add(eventKey);
      }
    });

    // Deduplicate only true multi-outcome events
    // This prevents showing "When will Bitcoin hit $150k?" 4 times
    // But keeps separate markets like "Arizona vs Baylor - Spread" and "Arizona vs Baylor - ML"
    const seenEvents = new Set<string>();
    const deduplicatedMarkets = allMarkets.filter(m => {
      const eventKey = m.eventTicker || m.ticker;

      // Only dedupe if this is a true multi-outcome event (all same title)
      if (trueMultiOutcomeEvents.has(eventKey)) {
        if (seenEvents.has(eventKey)) {
          return false; // Skip duplicate
        }
        seenEvents.add(eventKey);
      }
      return true;
    });

    // Group all markets by eventTicker for getting top outcomes
    const eventMarkets = new Map<string, DFlowMarketFull[]>();
    allMarkets.forEach(m => {
      const eventKey = m.eventTicker || m.ticker;
      if (!eventMarkets.has(eventKey)) {
        eventMarkets.set(eventKey, []);
      }
      eventMarkets.get(eventKey)!.push(m);
    });

    // Transform to consistent format, including top outcomes for multi-outcome events
    const markets = deduplicatedMarkets.slice(0, limit).map(m => {
      const eventKey = m.eventTicker || m.ticker;
      const siblings = eventMarkets.get(eventKey) || [m];

      // Only consider it multi-outcome if:
      // 1. Multiple markets share the eventTicker
      // 2. AND all markets have the same title (true multi-outcome, not just related markets)
      // 3. AND the extracted labels are actually different
      const allSameTitle = siblings.length > 1 && siblings.every(s => s.title === siblings[0].title);

      // Pre-compute labels to check if they're different
      let topOutcomes: { label: string; probability: number }[] | null = null;
      let isMultiOutcome = false;

      if (allSameTitle) {
        const potentialOutcomes = siblings
          .map(s => ({
            ticker: s.ticker,
            title: s.title,
            yesPrice: parseFloat(s.yesAsk || s.yesBid || "0.5"),
            label: getOutcomeLabel(s.ticker, s.title, siblings),
          }))
          .sort((a, b) => b.yesPrice - a.yesPrice);

        // Check if labels are actually different
        const uniqueLabels = new Set(potentialOutcomes.map(o => o.label));

        if (uniqueLabels.size > 1) {
          // Labels are different - this is a true multi-outcome event
          isMultiOutcome = true;
          topOutcomes = potentialOutcomes.slice(0, 2).map(o => ({
            label: o.label,
            probability: Math.round(o.yesPrice * 100),
          }));
        }
      }

      return {
        ...transformDFlowMarket(m),
        isMultiOutcome,
        topOutcomes,
      };
    });

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

/**
 * Check if a market is a sports championship/finals market
 */
function isSportsChampionship(ticker: string, title: string): boolean {
  const t = (ticker || "").toUpperCase();
  const titleLower = (title || "").toLowerCase();

  // Sports league tickers
  const sportsLeagues = [
    "KXNBA",      // NBA
    "KXNFL",      // NFL
    "KXMLB",      // MLB
    "KXNHL",      // NHL
    "KXMARMAD",   // March Madness / College Basketball
    "KXNCAA",     // NCAA
    "KXSB",       // Super Bowl
    "KXWOMARMAD", // Women's March Madness
    "KXCFP",      // College Football Playoff
    "KXOLYMPICS", // Olympics
    "KXWORLDCUP", // World Cup
    "KXPREMIER",  // Premier League
    "KXCHAMPIONS",// Champions League
    "KXWORLDSERIES", // World Series
    "KXSTANLEY",  // Stanley Cup
  ];

  // Check if ticker starts with any sports league
  const isSportsLeague = sportsLeagues.some(league => t.startsWith(league));

  // Championship keywords in title
  const championshipKeywords = [
    "champion", "championship", "finals", "win the",
    "super bowl", "world series", "stanley cup",
    "march madness", "national championship",
    "playoff", "olympics", "gold medal"
  ];

  const hasChampionshipKeyword = championshipKeywords.some(kw => titleLower.includes(kw));

  // Exclude MVP, individual player props, round leaders, etc.
  const excludeKeywords = ["mvp", "leader", "round 1", "round 2", "top scorer", "award"];
  const isExcluded = excludeKeywords.some(kw => titleLower.includes(kw));

  return (isSportsLeague || hasChampionshipKeyword) && !isExcluded;
}

function extractCategory(ticker: string): string {
  if (!ticker) return "Other";
  const t = ticker.toUpperCase();

  // Sports
  if (t.includes("NFL") || t.includes("NBA") || t.includes("MLB") ||
      t.includes("NHL") || t.includes("NCAA") || t.includes("MAR") ||
      t.includes("BOWL") || t.includes("MVP") || t.includes("PGA") ||
      t.includes("PREMIER") || t.includes("OSCAR") || t.includes("TENNIS") ||
      t.includes("GOLF") || t.includes("UFC") || t.includes("BOXING") ||
      t.includes("SOCCER") || t.includes("WORLDCUP") || t.includes("OLYMPICS")) {
    return "Sports";
  }
  // Politics
  if (t.includes("PRES") || t.includes("FED") || t.includes("NOM") ||
      t.includes("TRUMP") || t.includes("DEM") || t.includes("REP") ||
      t.includes("POWELL") || t.includes("KHAMENEI") || t.includes("GREENLAND") ||
      t.includes("BIDEN") || t.includes("CONGRESS") || t.includes("SENATE") ||
      t.includes("SCOTUS") || t.includes("ELECT") || t.includes("VOTE") ||
      t.includes("GOV") || t.includes("POPE") || t.includes("WAR") ||
      t.includes("UKRAINE") || t.includes("RUSSIA") || t.includes("CHINA") ||
      t.includes("IRAN") || t.includes("ISRAEL") || t.includes("NATO")) {
    return "Politics";
  }
  // Economics
  if (t.includes("CPI") || t.includes("GDP") || t.includes("FOMC") ||
      t.includes("RATE") || t.includes("INFLATION") || t.includes("JOBS") ||
      t.includes("UNEMPLOYMENT") || t.includes("RECESSION") || t.includes("DEBT") ||
      t.includes("TREASURY") || t.includes("BOND") || t.includes("STOCK") ||
      t.includes("SPX") || t.includes("SPY") || t.includes("QQQ") ||
      t.includes("DOW") || t.includes("NASDAQ") || t.includes("EARNINGS") ||
      t.includes("BTC") || t.includes("ETH") || t.includes("CRYPTO") ||
      t.includes("OIL") || t.includes("GOLD") || t.includes("SILVER")) {
    return "Economics";
  }

  return "Other";
}
