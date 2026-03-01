import { NextResponse } from "next/server";
import { getConnection } from "@/lib/solana";
import { getOutcomeMints } from "@/lib/dflow";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const DFLOW_API = process.env.DFLOW_METADATA_API || "https://d.prediction-markets-api.dflow.net";

function getDFlowHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const apiKey = process.env.DFLOW_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

interface VerificationResult {
  verified: boolean;
  position?: {
    side: string;
    value: number;
    ticker: string;
  };
  error?: string;
}

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/chat/[eventTicker]/verify?wallet=xxx
 *
 * Verify that a wallet holds any tokens for markets in this event.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventTicker: string }> }
): Promise<NextResponse<VerificationResult>> {
  try {
    const { eventTicker: rawEventTicker } = await params;
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    const eventTicker = decodeURIComponent(rawEventTicker);

    if (!wallet) {
      return NextResponse.json({ verified: false, error: "Missing wallet address" });
    }

    if (!eventTicker) {
      return NextResponse.json({ verified: false, error: "Missing event ticker" });
    }

    if (!isValidSolanaAddress(wallet)) {
      return NextResponse.json({ verified: false, error: "Invalid wallet address format" });
    }

    console.log("[Chat Verify] Wallet:", wallet);
    console.log("[Chat Verify] Event:", eventTicker);

    // Step 1: Get all token holdings from wallet
    const connection = getConnection();
    const pubkey = new PublicKey(wallet);

    let legacyAccounts, token2022Accounts;
    try {
      [legacyAccounts, token2022Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
      ]);
    } catch (rpcErr: any) {
      console.error("[Chat Verify] RPC error:", rpcErr.message);
      return NextResponse.json({ verified: false, error: "Failed to fetch wallet tokens" });
    }

    const holdings = [...legacyAccounts.value, ...token2022Accounts.value]
      .map((account) => ({
        mint: account.account.data.parsed.info.mint as string,
        balance: account.account.data.parsed.info.tokenAmount.uiAmount as number,
      }))
      .filter((h) => h.balance > 0);

    console.log("[Chat Verify] Token holdings:", holdings.length);
    holdings.forEach(h => console.log("[Chat Verify]   -", h.mint, "balance:", h.balance));

    if (holdings.length === 0) {
      return NextResponse.json({ verified: false, error: "No tokens in wallet" });
    }

    // Step 2: Get ALL active markets
    let markets: any[] = [];
    try {
      const res = await fetch(`${DFLOW_API}/api/v1/markets?status=active&limit=500`, {
        headers: getDFlowHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        markets = data.markets || data || [];
      }
    } catch (e) {
      console.error("[Chat Verify] Failed to fetch markets:", e);
    }

    console.log("[Chat Verify] Total markets:", markets.length);

    // Step 3: For each market, check if user holds its tokens
    const eventTickerUpper = eventTicker.toUpperCase();

    for (const market of markets) {
      const ticker = (market.ticker || "").toUpperCase();
      const mEventTicker = (market.eventTicker || "").toUpperCase();

      // Check if this market belongs to the event we care about
      const isMatch =
        ticker === eventTickerUpper ||
        ticker.startsWith(eventTickerUpper + "-") ||
        ticker.includes(eventTickerUpper) ||
        mEventTicker === eventTickerUpper ||
        mEventTicker.startsWith(eventTickerUpper) ||
        mEventTicker.includes(eventTickerUpper) ||
        // Also try partial matching for NBA markets
        (eventTickerUpper.includes("NBA") && ticker.includes("NBA")) ||
        (eventTickerUpper.includes("CHAMP") && ticker.includes("CHAMP"));

      if (!isMatch) continue;

      // Get the YES/NO mints for this market
      try {
        const mints = await getOutcomeMints(market.ticker);

        // Check if user holds YES tokens
        const yesHolding = holdings.find(h => h.mint === mints.yesMint);
        if (yesHolding) {
          // Extract team name from title
          let teamName = market.ticker.split("-").pop() || "YES";
          if (market.title) {
            const match = market.title.match(/Will\s+(?:the\s+)?(.+?)\s+win/i);
            if (match) teamName = match[1];
          }

          console.log("[Chat Verify] MATCH FOUND! User holds YES on", market.ticker);
          return NextResponse.json({
            verified: true,
            position: { side: teamName, value: yesHolding.balance, ticker: market.ticker },
          });
        }

        // Check if user holds NO tokens
        const noHolding = holdings.find(h => h.mint === mints.noMint);
        if (noHolding) {
          console.log("[Chat Verify] MATCH FOUND! User holds NO on", market.ticker);
          return NextResponse.json({
            verified: true,
            position: { side: "NO", value: noHolding.balance, ticker: market.ticker },
          });
        }
      } catch {
        // Skip markets where we can't get mints
        continue;
      }
    }

    // No match found - log helpful debug info
    console.log("[Chat Verify] No matching position found");
    console.log("[Chat Verify] User's mints:", holdings.map(h => h.mint));

    return NextResponse.json({
      verified: false,
      error: "No positions found for this event"
    });

  } catch (error: any) {
    console.error("[Chat Verify] Error:", error);
    return NextResponse.json({ verified: false, error: error.message || "Verification failed" });
  }
}
