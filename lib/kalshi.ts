/**
 * Kalshi API Client
 * 
 * Public endpoints for market data (no auth required).
 * API docs: https://docs.kalshi.com
 */

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title: string;
  no_sub_title: string;
  status: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  expiration_time: string;
  category?: string;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  subtitle: string;
  category: string;
  markets: KalshiMarket[];
  volume: number;
  volume_24h: number;
}

/**
 * Get markets from Kalshi API
 * Uses mve_filter=exclude to filter out multivariate/combo markets
 */
export async function getMarkets(options: {
  limit?: number;
  status?: "open" | "closed" | "settled";
  cursor?: string;
} = {}): Promise<{ markets: KalshiMarket[]; cursor: string | null }> {
  const { limit = 100, status = "open", cursor } = options;
  
  const params = new URLSearchParams({
    limit: limit.toString(),
    status,
    mve_filter: "exclude", // This is the key - excludes combo/multivariate markets
  });
  
  if (cursor) {
    params.set("cursor", cursor);
  }

  console.log(`[Kalshi] Fetching: ${KALSHI_API}/markets?${params}`);

  const res = await fetch(`${KALSHI_API}/markets?${params}`, {
    headers: {
      "Accept": "application/json",
    },
  });
  
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Kalshi] API error ${res.status}:`, text);
    throw new Error(`Kalshi API error: ${res.status}`);
  }

  const data = await res.json();
  
  console.log(`[Kalshi] Got ${data.markets?.length || 0} markets`);
  
  // Sort by 24h volume (trending) - higher volume = more popular
  const markets = (data.markets || []).sort(
    (a: KalshiMarket, b: KalshiMarket) => (b.volume_24h || 0) - (a.volume_24h || 0)
  );

  return {
    markets,
    cursor: data.cursor || null,
  };
}

/**
 * Get a single market by ticker
 */
export async function getMarket(ticker: string): Promise<KalshiMarket | null> {
  console.log(`[Kalshi] Fetching market: ${ticker}`);
  
  const res = await fetch(`${KALSHI_API}/markets/${encodeURIComponent(ticker)}`, {
    headers: {
      "Accept": "application/json",
    },
  });
  
  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text();
    console.error(`[Kalshi] API error ${res.status}:`, text);
    throw new Error(`Kalshi API error: ${res.status}`);
  }

  const data = await res.json();
  return data.market;
}

/**
 * Get events (grouped markets) from Kalshi
 */
export async function getEvents(options: {
  limit?: number;
  status?: "open" | "closed" | "settled";
  withNestedMarkets?: boolean;
} = {}): Promise<KalshiEvent[]> {
  const { limit = 50, status = "open", withNestedMarkets = true } = options;
  
  const params = new URLSearchParams({
    limit: limit.toString(),
    status,
    with_nested_markets: withNestedMarkets.toString(),
  });

  const res = await fetch(`${KALSHI_API}/events?${params}`, {
    headers: {
      "Accept": "application/json",
    },
  });
  
  if (!res.ok) {
    throw new Error(`Kalshi API error: ${res.status}`);
  }

  const data = await res.json();
  return data.events || [];
}

/**
 * Search markets by title/ticker
 */
export async function searchMarkets(query: string): Promise<KalshiMarket[]> {
  // Fetch more markets to search through
  const allMarkets = await fetchAllOpenMarkets(500);
  
  const q = query.toLowerCase();
  
  return allMarkets
    .filter(
      (m) =>
        m.title?.toLowerCase().includes(q) ||
        m.ticker?.toLowerCase().includes(q) ||
        m.subtitle?.toLowerCase().includes(q)
    )
    .sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0));
}

/**
 * Fetch multiple pages of markets to get a larger sample
 */
async function fetchAllOpenMarkets(maxMarkets = 500): Promise<KalshiMarket[]> {
  const allMarkets: KalshiMarket[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const maxPages = Math.ceil(maxMarkets / 100);

  while (pages < maxPages) {
    const result = await getMarkets({ limit: 100, cursor: cursor || undefined });
    allMarkets.push(...result.markets);
    cursor = result.cursor;
    pages++;
    
    if (!cursor) break; // No more pages
  }

  console.log(`[Kalshi] Fetched ${allMarkets.length} total markets across ${pages} pages`);
  return allMarkets;
}

/**
 * Get trending markets (highest 24h volume)
 * Fetches multiple pages to find truly highest volume markets
 */
export async function getTrendingMarkets(limit = 30): Promise<KalshiMarket[]> {
  // Fetch up to 500 markets to find the best ones
  const allMarkets = await fetchAllOpenMarkets(500);
  
  // Sort by 24h volume descending
  const sorted = allMarkets.sort(
    (a, b) => (b.volume_24h || 0) - (a.volume_24h || 0)
  );
  
  // Filter out markets with 0 volume (boring/inactive)
  const activeMarkets = sorted.filter(m => (m.volume_24h || 0) > 0);
  
  console.log(`[Kalshi] Found ${activeMarkets.length} markets with volume, returning top ${limit}`);
  
  return activeMarkets.slice(0, limit);
}

/**
 * Get market categories from events
 */
export async function getCategories(): Promise<string[]> {
  const events = await getEvents({ limit: 100 });
  
  const categories = new Set<string>();
  events.forEach((e) => {
    if (e.category) categories.add(e.category);
  });
  
  return Array.from(categories).sort();
}

/**
 * Transform Kalshi market to our internal format
 */
export function transformMarket(m: KalshiMarket) {
  // Kalshi prices are in cents (0-100)
  // Use last_price if available, otherwise midpoint of bid/ask
  let yesPrice: number;
  
  if (m.last_price && m.last_price > 0 && m.last_price <= 100) {
    yesPrice = m.last_price;
  } else if (m.yes_bid && m.yes_ask) {
    yesPrice = Math.round((m.yes_bid + m.yes_ask) / 2);
  } else if (m.yes_bid) {
    yesPrice = m.yes_bid;
  } else if (m.yes_ask) {
    yesPrice = m.yes_ask;
  } else {
    yesPrice = 50; // Default to 50/50 if no price data
  }
  
  // Ensure price is in valid range
  yesPrice = Math.max(1, Math.min(99, yesPrice));
  
  // No price is always 100 - yes price (binary market)
  const noPrice = 100 - yesPrice;
  
  return {
    ticker: m.ticker,
    eventTicker: m.event_ticker,
    title: m.title || m.ticker,
    subtitle: m.subtitle || "",
    category: m.category || extractCategory(m.event_ticker || m.ticker),
    status: m.status,
    yesPrice: yesPrice / 100, // Convert to 0-1 decimal
    noPrice: noPrice / 100,
    yesBid: m.yes_bid || 0,
    yesAsk: m.yes_ask || 0,
    noBid: m.no_bid || 0,
    noAsk: m.no_ask || 0,
    lastPrice: m.last_price || 0,
    volume: m.volume || 0,
    volume24h: m.volume_24h || 0,
    openInterest: m.open_interest || 0,
    closeTime: m.close_time || "",
    expirationTime: m.expiration_time || "",
  };
}

/**
 * Extract category from event ticker prefix
 */
function extractCategory(ticker: string): string {
  if (!ticker) return "Other";
  
  const t = ticker.toUpperCase();
  
  // Check for known category patterns
  if (t.includes("NFL") || t.includes("NBA") || t.includes("MLB") || 
      t.includes("NHL") || t.includes("MMA") || t.includes("SOCCER") ||
      t.includes("SPORTS") || t.includes("SB-") || t.includes("SUPERBOWL")) {
    return "Sports";
  }
  if (t.includes("PRES") || t.includes("ELEC") || t.includes("GOV") || 
      t.includes("SEN") || t.includes("CONGRESS") || t.includes("TRUMP") ||
      t.includes("BIDEN") || t.includes("POLITICAL")) {
    return "Politics";
  }
  if (t.includes("CPI") || t.includes("GDP") || t.includes("FED") || 
      t.includes("RATE") || t.includes("ECON") || t.includes("JOBS") ||
      t.includes("INFLATION") || t.includes("RECESSION")) {
    return "Economics";
  }
  if (t.includes("BTC") || t.includes("ETH") || t.includes("CRYPTO") ||
      t.includes("BITCOIN") || t.includes("SOLANA")) {
    return "Crypto";
  }
  if (t.includes("AI") || t.includes("TECH") || t.includes("APPLE") ||
      t.includes("GOOGLE") || t.includes("META") || t.includes("NVIDIA")) {
    return "Tech";
  }
  if (t.includes("WEATHER") || t.includes("TEMP") || t.includes("HURRICANE") ||
      t.includes("SNOW") || t.includes("RAIN")) {
    return "Weather";
  }
  if (t.includes("OSCAR") || t.includes("EMMY") || t.includes("GRAMMY") ||
      t.includes("MOVIE") || t.includes("ROTTEN")) {
    return "Entertainment";
  }
  
  return "Other";
}
