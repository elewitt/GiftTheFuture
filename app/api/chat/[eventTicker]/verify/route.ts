import { NextResponse } from "next/server";
import { getTokenBalance, getConnection } from "@/lib/solana";
import { getOutcomeMints, getMarket } from "@/lib/dflow";
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

/**
 * Validate that a string is a valid Solana address
 */
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
 * Verify that a wallet holds any tokens for the given market.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventTicker: string }> }
): Promise<NextResponse<VerificationResult>> {
  try {
    const { eventTicker: rawEventTicker } = await params;
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");

    // Decode URL-encoded event ticker
    const eventTicker = decodeURIComponent(rawEventTicker);

    if (!wallet) {
      return NextResponse.json({ verified: false, error: "Missing wallet address" });
    }

    if (!eventTicker) {
      return NextResponse.json({ verified: false, error: "Missing event ticker" });
    }

    // Validate wallet address
    if (!isValidSolanaAddress(wallet)) {
      return NextResponse.json({
        verified: false,
        error: "Invalid wallet address format"
      });
    }

    console.log("[Chat Verify] Checking wallet:", wallet, "for event:", eventTicker);

    // Get all token accounts for this wallet
    const connection = getConnection();
    const pubkey = new PublicKey(wallet);

    let legacyAccounts, token2022Accounts;
    try {
      [legacyAccounts, token2022Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(pubkey, {
          programId: TOKEN_PROGRAM_ID,
        }),
        connection.getParsedTokenAccountsByOwner(pubkey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);
    } catch (rpcErr: any) {
      console.error("[Chat Verify] RPC error fetching token accounts:", rpcErr.message);
      return NextResponse.json({
        verified: false,
        error: "Failed to fetch wallet tokens from Solana"
      });
    }

    const allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];
    const holdings = allAccounts
      .map((account) => ({
        mint: account.account.data.parsed.info.mint as string,
        balance: account.account.data.parsed.info.tokenAmount.uiAmount as number,
      }))
      .filter((h) => h.balance > 0);

    console.log("[Chat Verify] Found", holdings.length, "token holdings");
    console.log("[Chat Verify] Holdings:", holdings.map(h => ({ mint: h.mint.slice(0, 8) + "...", balance: h.balance })));

    if (holdings.length === 0) {
      return NextResponse.json({
        verified: false,
        error: "No tokens found in wallet"
      });
    }

    // Get the market's outcome mints
    let yesMint: string | null = null;
    let noMint: string | null = null;

    try {
      const mints = await getOutcomeMints(eventTicker);
      yesMint = mints.yesMint;
      noMint = mints.noMint;
      console.log("[Chat Verify] Market mints - YES:", yesMint, "NO:", noMint);
    } catch (err) {
      console.log("[Chat Verify] Could not get mints for", eventTicker, "- trying as event ticker");

      // eventTicker might be an event, not a specific market
      // Try to fetch all markets and find ones matching this event
      try {
        const DFLOW_API = process.env.DFLOW_METADATA_API || "https://d.prediction-markets-api.dflow.net";
        const res = await fetch(`${DFLOW_API}/api/v1/markets?status=active&limit=200`, {
          headers: { "Content-Type": "application/json" },
        });

        if (res.ok) {
          const data = await res.json();
          const markets = data.markets || data || [];

          // Find markets matching this event ticker
          const eventTickerUpper = eventTicker.toUpperCase();
          const matchingMarkets = markets.filter((m: any) => {
            const ticker = (m.ticker || "").toUpperCase();
            const mEventTicker = (m.eventTicker || "").toUpperCase();
            return ticker === eventTickerUpper ||
                   ticker.startsWith(eventTickerUpper + "-") ||
                   mEventTicker === eventTickerUpper ||
                   mEventTicker.startsWith(eventTickerUpper);
          });

          console.log("[Chat Verify] Looking for event:", eventTickerUpper);
          console.log("[Chat Verify] Found", matchingMarkets.length, "matching markets");
          if (matchingMarkets.length > 0) {
            console.log("[Chat Verify] Matching market tickers:", matchingMarkets.slice(0, 5).map((m: any) => m.ticker));
          } else {
            // Log some sample tickers to help debug
            console.log("[Chat Verify] Sample market tickers:", markets.slice(0, 5).map((m: any) => ({ ticker: m.ticker, eventTicker: m.eventTicker })));
          }

          // Check if wallet holds any tokens from any matching market
          for (const market of matchingMarkets) {
            try {
              const mints = await getOutcomeMints(market.ticker);
              console.log("[Chat Verify] Checking market", market.ticker, "- YES mint:", mints.yesMint?.slice(0, 8), "NO mint:", mints.noMint?.slice(0, 8));

              // Extract outcome name from ticker or title
              // e.g., KXNBA-26-CHAMP-SAS -> "SAS" or from title "Will the San Antonio..."
              let outcomeName = "YES";
              const tickerParts = market.ticker.split("-");
              if (tickerParts.length > 0) {
                outcomeName = tickerParts[tickerParts.length - 1];
              }
              // Try to get better name from title
              if (market.title) {
                const titleMatch = market.title.match(/Will\s+(?:the\s+)?(.+?)\s+win/i);
                if (titleMatch) {
                  outcomeName = titleMatch[1];
                }
              }

              // Check YES mint (betting on this outcome)
              const yesHolding = holdings.find(h => h.mint === mints.yesMint);
              if (yesHolding) {
                return NextResponse.json({
                  verified: true,
                  position: {
                    side: outcomeName,
                    value: yesHolding.balance,
                    ticker: market.ticker,
                  },
                });
              }

              // Check NO mint (betting against this outcome)
              const noHolding = holdings.find(h => h.mint === mints.noMint);
              if (noHolding) {
                return NextResponse.json({
                  verified: true,
                  position: {
                    side: `NO ${outcomeName}`,
                    value: noHolding.balance,
                    ticker: market.ticker,
                  },
                });
              }
            } catch {
              continue;
            }
          }
        }
      } catch (e) {
        console.error("[Chat Verify] Failed to search markets:", e);
      }

      return NextResponse.json({
        verified: false,
        error: "No matching positions found for this market"
      });
    }

    // Check if wallet holds YES tokens
    const yesHolding = holdings.find(h => h.mint === yesMint);
    if (yesHolding) {
      return NextResponse.json({
        verified: true,
        position: {
          side: "YES",
          value: yesHolding.balance,
          ticker: eventTicker,
        },
      });
    }

    // Check if wallet holds NO tokens
    const noHolding = holdings.find(h => h.mint === noMint);
    if (noHolding) {
      return NextResponse.json({
        verified: true,
        position: {
          side: "NO",
          value: noHolding.balance,
          ticker: eventTicker,
        },
      });
    }

    return NextResponse.json({
      verified: false,
      error: "No positions found for this market"
    });

  } catch (error: any) {
    console.error("[/api/chat/verify] Error:", error);
    return NextResponse.json({
      verified: false,
      error: error.message || "Verification failed"
    });
  }
}
