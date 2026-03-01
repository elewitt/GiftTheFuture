import { NextResponse } from "next/server";
import { getConnection } from "@/lib/solana";
import { getActiveEvents, getOutcomeMints, DFlowEvent } from "@/lib/dflow";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

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

    // Step 2: Get ALL active events with nested markets (same as rest of app)
    let events: DFlowEvent[] = [];
    try {
      events = await getActiveEvents(500, "active");
      console.log("[Chat Verify] Total events:", events.length);
    } catch (e) {
      console.error("[Chat Verify] Failed to fetch events:", e);
    }

    // Step 3: Find markets matching this event ticker
    const eventTickerUpper = eventTicker.toUpperCase();
    const matchingMarkets: { ticker: string; title: string }[] = [];

    for (const event of events) {
      const evtTicker = (event.ticker || "").toUpperCase();

      // Check if this event matches
      const isEventMatch =
        evtTicker === eventTickerUpper ||
        evtTicker.includes(eventTickerUpper) ||
        eventTickerUpper.includes(evtTicker) ||
        // NBA-specific matching
        (eventTickerUpper.includes("NBA") && evtTicker.includes("NBA")) ||
        (eventTickerUpper.includes("CHAMP") && evtTicker.includes("CHAMP"));

      if (!isEventMatch) continue;

      // Add all markets from this event
      if (event.markets) {
        for (const market of event.markets) {
          matchingMarkets.push({ ticker: market.ticker, title: market.title });
        }
      }
    }

    console.log("[Chat Verify] Matching markets:", matchingMarkets.length);
    matchingMarkets.forEach(m => console.log("[Chat Verify]   -", m.ticker));

    // Step 4: Check if user holds tokens for any matching market
    for (const market of matchingMarkets) {
      try {
        const mints = await getOutcomeMints(market.ticker);
        console.log("[Chat Verify] Checking market", market.ticker, "mints:", mints.yesMint, mints.noMint);

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
      } catch (err) {
        console.log("[Chat Verify] Skipping market", market.ticker, "- could not get mints");
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
