/**
 * DFlow API Client
 *
 * Handles all communication with DFlow's Prediction Markets infrastructure:
 * - Metadata API: market discovery, prices, orderbook
 * - Trade API: buy/sell outcome tokens
 * - WebSocket: real-time price feeds
 *
 * Docs: https://pond.dflow.net
 */

// Dev endpoints — switch to production URLs when you coordinate with DFlow team
// Dev docs: https://pond.dflow.net/build/endpoints
const METADATA_API =
  process.env.DFLOW_METADATA_API || "https://d.prediction-markets-api.dflow.net";
const TRADE_API =
  process.env.DFLOW_TRADE_API || "https://d.quote-api.dflow.net";
const WS_URL =
  process.env.DFLOW_WS_URL || "wss://d.prediction-markets-api.dflow.net/api/v1/ws";

function apiKey(): string {
  return process.env.DFLOW_API_KEY || "";
}

function headers(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  const key = apiKey();
  if (key) h["x-api-key"] = key;
  return h;
}

// ─── Types ───────────────────────────────────────────────────

export interface DFlowEvent {
  ticker: string;
  title: string;
  subtitle: string;
  seriesTicker: string;
  status: string;
  category?: string;
  markets?: DFlowMarket[];
}

export interface DFlowMarketAccounts {
  yesMint: string;
  noMint: string;
  marketLedger?: string;
  isInitialized?: boolean;
  redemptionStatus?: string;
}

export interface DFlowMarket {
  ticker: string;
  title: string;
  status: string;
  accounts: {
    [collateralMint: string]: DFlowMarketAccounts;
  };
  yes_price?: number;
  no_price?: number;
  volume?: number;
  open_time?: string;
  close_time?: string;
  expiration_time?: string;
}

export interface OrderResponse {
  transaction: string; // Base64-encoded Solana transaction
  executionMode: "sync" | "async";
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  minOutAmount: string;
  slippageBps: number;
  lastValidBlockHeight: number;
}

export interface PriceUpdate {
  market_ticker: string;
  yes_bid: string | null;
  yes_ask: string | null;
  no_bid: string | null;
  no_ask: string | null;
}

// ─── Metadata API (Market Discovery) ────────────────────────

/**
 * Fetch active prediction market events with nested markets.
 * Each event contains markets with on-chain token mint addresses.
 */
export async function getActiveEvents(
  limit = 50,
  status = "active"
): Promise<DFlowEvent[]> {
  const url = `${METADATA_API}/api/v1/events?withNestedMarkets=true&status=${status}&limit=${limit}`;
  const res = await fetch(url, { headers: headers(), next: { revalidate: 30 } });

  if (!res.ok) {
    throw new Error(`DFlow getActiveEvents failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.events || [];
}

/**
 * Get a single market by ticker.
 */
export async function getMarket(ticker: string): Promise<DFlowMarket> {
  const res = await fetch(`${METADATA_API}/api/v1/market/${ticker}`, {
    headers: headers(),
    next: { revalidate: 10 },
  });

  if (!res.ok) throw new Error(`Market not found: ${ticker}`);
  const data = await res.json();
  // DFlow API returns the market object directly, not wrapped in { market: ... }
  return data;
}

/**
 * Look up a market by its SPL token mint address.
 * Useful for identifying what market a token in someone's wallet belongs to.
 *
 * Since DFlow's by-mint API may return 403, we build a local cache from
 * active events/markets data.
 */

// Cache mint -> market mappings
let mintToMarketCache: Map<string, { market: DFlowMarket; side: "YES" | "NO" }> | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function buildMintCache(): Promise<Map<string, { market: DFlowMarket; side: "YES" | "NO" }>> {
  const cache = new Map<string, { market: DFlowMarket; side: "YES" | "NO" }>();

  try {
    // Fetch all active events with nested markets
    const events = await getActiveEvents(200, "active");

    for (const event of events) {
      if (!event.markets) continue;

      for (const market of event.markets) {
        if (!market.accounts) continue;

        // Process accounts for each collateral type
        for (const accounts of Object.values(market.accounts)) {
          if (accounts.yesMint) {
            cache.set(accounts.yesMint, { market, side: "YES" });
          }
          if (accounts.noMint) {
            cache.set(accounts.noMint, { market, side: "NO" });
          }
        }
      }
    }

    // Also fetch finalized markets for recently resolved positions
    try {
      const finalizedEvents = await getActiveEvents(50, "finalized");
      for (const event of finalizedEvents) {
        if (!event.markets) continue;
        for (const market of event.markets) {
          if (!market.accounts) continue;
          for (const accounts of Object.values(market.accounts)) {
            if (accounts.yesMint && !cache.has(accounts.yesMint)) {
              cache.set(accounts.yesMint, { market, side: "YES" });
            }
            if (accounts.noMint && !cache.has(accounts.noMint)) {
              cache.set(accounts.noMint, { market, side: "NO" });
            }
          }
        }
      }
    } catch {
      // Ignore errors fetching finalized - active is sufficient
    }
  } catch (err) {
    console.error("[DFlow] Failed to build mint cache:", err);
  }

  return cache;
}

export async function getMarketByMint(
  mintAddress: string
): Promise<DFlowMarket | null> {
  // Use cached data
  if (!mintToMarketCache || Date.now() > cacheExpiry) {
    mintToMarketCache = await buildMintCache();
    cacheExpiry = Date.now() + CACHE_TTL;
    console.log(`[DFlow] Mint cache built with ${mintToMarketCache.size} entries`);
  }

  const entry = mintToMarketCache.get(mintAddress);
  return entry?.market || null;
}

/**
 * Get market and side info for a mint address.
 */
export async function getMarketInfoByMint(
  mintAddress: string
): Promise<{ market: DFlowMarket; side: "YES" | "NO" } | null> {
  if (!mintToMarketCache || Date.now() > cacheExpiry) {
    mintToMarketCache = await buildMintCache();
    cacheExpiry = Date.now() + CACHE_TTL;
    console.log(`[DFlow] Mint cache built with ${mintToMarketCache.size} entries`);
  }

  return mintToMarketCache.get(mintAddress) || null;
}

/**
 * Get outcome token mint addresses (YES and NO) for a market.
 * DFlow markets have accounts keyed by collateral type - we use USDC.
 */
export async function getOutcomeMints(
  ticker: string
): Promise<{ yesMint: string; noMint: string }> {
  const market = await getMarket(ticker);

  // Accounts are nested by collateral mint (USDC)
  const usdcAccounts = market.accounts[USDC_MINT];
  if (!usdcAccounts) {
    throw new Error(`No USDC-collateralized market found for ${ticker}`);
  }

  return {
    yesMint: usdcAccounts.yesMint,
    noMint: usdcAccounts.noMint,
  };
}

/**
 * Get available categories and tags for browsing/filtering.
 */
export async function getCategories(): Promise<Record<string, string[]>> {
  const res = await fetch(`${METADATA_API}/api/v1/tags_by_categories`, {
    headers: headers(),
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error("Failed to fetch categories");
  const data = await res.json();
  return data.tagsByCategories || {};
}

/**
 * Get live orderbook for a market.
 */
export async function getOrderbook(ticker: string) {
  const res = await fetch(
    `${METADATA_API}/api/v1/market/${ticker}/orderbook`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error("Failed to fetch orderbook");
  return res.json();
}

// ─── Trade API (Buy/Sell Outcome Tokens) ────────────────────

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Create a trade order via DFlow.
 * Returns a base64-encoded Solana transaction ready to sign + submit.
 *
 * For gifting flow:
 *   inputMint = USDC (what gifter pays with)
 *   outputMint = market's yesMint or noMint
 *   userPublicKey = your server wallet (buys on behalf of gifter)
 */
export async function createOrder(params: {
  inputMint: string;
  outputMint: string;
  amount: number; // In smallest unit (e.g., USDC has 6 decimals)
  slippageBps: number;
  userPublicKey: string;
}): Promise<OrderResponse> {
  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    slippageBps: params.slippageBps.toString(),
    userPublicKey: params.userPublicKey,
  });

  const res = await fetch(`${TRADE_API}/order?${query.toString()}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DFlow createOrder failed: ${res.status} — ${body}`);
  }

  return res.json();
}

/**
 * Poll order status for async execution mode.
 * DFlow CLPs may fill orders asynchronously.
 */
export async function getOrderStatus(
  signature: string
): Promise<{ status: string; fills?: any[] }> {
  const res = await fetch(
    `${TRADE_API}/order-status?signature=${signature}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error("Order status check failed");
  return res.json();
}

/**
 * Create a sell/redemption order.
 * Sells outcome tokens back for USDC.
 *
 * Used when recipient wants to "cash out" their position.
 */
export async function createRedemptionOrder(params: {
  outcomeMint: string;
  amount: number;
  userPublicKey: string;
  slippageBps?: number;
}): Promise<OrderResponse> {
  return createOrder({
    inputMint: params.outcomeMint,
    outputMint: USDC_MINT,
    amount: params.amount,
    slippageBps: params.slippageBps ?? 100,
    userPublicKey: params.userPublicKey,
  });
}

// ─── WebSocket (Real-Time Prices) ────────────────────────────

/**
 * Subscribe to real-time price updates for specific market tickers.
 * Returns a cleanup function to close the connection.
 *
 * Usage:
 *   const unsub = subscribeToPrices(['MICH-CFP-2026'], (update) => {
 *     console.log(update.yes_bid, update.yes_ask);
 *   });
 *   // later: unsub();
 */
export function subscribeToPrices(
  tickers: string[],
  onUpdate: (data: PriceUpdate) => void,
  onError?: (err: Event) => void
): () => void {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: "subscribe",
        channel: "prices",
        tickers,
      })
    );
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.channel === "prices") {
        onUpdate(message);
      }
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onerror = (err) => onError?.(err);

  return () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };
}
