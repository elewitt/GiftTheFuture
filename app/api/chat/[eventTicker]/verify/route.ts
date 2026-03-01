import { NextResponse } from "next/server";
import { getPositions, Position } from "@/lib/solana";
import { getOutcomeMints, getMarket } from "@/lib/dflow";
import { PublicKey } from "@solana/web3.js";

const MINIMUM_POSITION_VALUE = 1; // $1 minimum (for testing)

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
 * Verify that a wallet holds at least $1 worth of any outcome
 * for the given event. Returns position info if verified.
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

    // Get all positions for this wallet
    let positions: Position[];
    try {
      positions = await getPositions(wallet);
    } catch (posErr: any) {
      console.error("[Chat Verify] Failed to get positions:", posErr);
      return NextResponse.json({
        verified: false,
        error: "Failed to fetch wallet positions"
      });
    }

    if (positions.length === 0) {
      return NextResponse.json({
        verified: false,
        error: "No prediction market positions found in wallet"
      });
    }

    // Find positions matching this event
    // Events group multiple outcome markets (e.g., "Who will win MVP?" has multiple players)
    const matchingPositions = positions.filter(p => {
      if (!p.market) return false;
      // Check if market ticker starts with event ticker or matches event pattern
      const marketTicker = p.market.ticker.toUpperCase();
      const eventTickerUpper = eventTicker.toUpperCase();

      // Direct match or prefix match (e.g., KXNBA-MVP-2025 matches KXNBA-MVP-2025-SGIL)
      return marketTicker === eventTickerUpper ||
             marketTicker.startsWith(eventTickerUpper + "-") ||
             marketTicker.startsWith(eventTickerUpper);
    });

    if (matchingPositions.length === 0) {
      return NextResponse.json({
        verified: false,
        error: "No positions found for this market"
      });
    }

    // Get current prices for value calculation
    for (const position of matchingPositions) {
      if (!position.market) continue;

      try {
        const market = await getMarket(position.market.ticker);
        // Price is stored as 0-1, balance is in tokens (1 token = $1 if wins)
        // Current value = balance * current price
        const price = position.side === "YES"
          ? (market.yes_price ?? 0.5)
          : (market.no_price ?? 0.5);

        const positionValue = position.balance * price;

        if (positionValue >= MINIMUM_POSITION_VALUE) {
          return NextResponse.json({
            verified: true,
            position: {
              side: position.side,
              value: Math.round(positionValue * 100) / 100,
              ticker: position.market.ticker,
            },
          });
        }
      } catch (err) {
        console.error(`Failed to get price for ${position.market.ticker}:`, err);
        // Continue checking other positions
      }
    }

    // Check total value across all matching positions
    let totalValue = 0;
    let largestPosition = matchingPositions[0];

    for (const position of matchingPositions) {
      if (!position.market) continue;
      try {
        const market = await getMarket(position.market.ticker);
        const price = position.side === "YES"
          ? (market.yes_price ?? 0.5)
          : (market.no_price ?? 0.5);
        const value = position.balance * price;
        totalValue += value;

        if (value > (largestPosition.balance * 0.5)) {
          largestPosition = position;
        }
      } catch {
        // Skip position if can't get price
      }
    }

    if (totalValue >= MINIMUM_POSITION_VALUE) {
      return NextResponse.json({
        verified: true,
        position: {
          side: largestPosition.side,
          value: Math.round(totalValue * 100) / 100,
          ticker: largestPosition.market?.ticker || eventTicker,
        },
      });
    }

    return NextResponse.json({
      verified: false,
      error: `Position value ($${totalValue.toFixed(2)}) is below minimum ($${MINIMUM_POSITION_VALUE})`
    });

  } catch (error: any) {
    console.error("[/api/chat/verify] Error:", error);
    return NextResponse.json({
      verified: false,
      error: error.message || "Verification failed"
    });
  }
}
