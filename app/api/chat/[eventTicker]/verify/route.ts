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

    const [legacyAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];
    const holdings = allAccounts
      .map((account) => ({
        mint: account.account.data.parsed.info.mint as string,
        balance: account.account.data.parsed.info.tokenAmount.uiAmount as number,
      }))
      .filter((h) => h.balance > 0);

    console.log("[Chat Verify] Found", holdings.length, "token holdings");

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
          const matchingMarkets = markets.filter((m: any) => {
            const ticker = (m.ticker || "").toUpperCase();
            const eventTickerUpper = eventTicker.toUpperCase();
            return ticker === eventTickerUpper ||
                   ticker.startsWith(eventTickerUpper + "-") ||
                   (m.eventTicker || "").toUpperCase() === eventTickerUpper;
          });

          console.log("[Chat Verify] Found", matchingMarkets.length, "matching markets");

          // Check if wallet holds any tokens from any matching market
          for (const market of matchingMarkets) {
            try {
              const mints = await getOutcomeMints(market.ticker);

              // Check YES mint
              const yesHolding = holdings.find(h => h.mint === mints.yesMint);
              if (yesHolding) {
                return NextResponse.json({
                  verified: true,
                  position: {
                    side: "YES",
                    value: yesHolding.balance,
                    ticker: market.ticker,
                  },
                });
              }

              // Check NO mint
              const noHolding = holdings.find(h => h.mint === mints.noMint);
              if (noHolding) {
                return NextResponse.json({
                  verified: true,
                  position: {
                    side: "NO",
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
