import { NextResponse } from "next/server";
import { getPositions, Position } from "@/lib/solana";
import { getOutcomeMints, getMarket } from "@/lib/dflow";

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
 * GET /api/chat/[eventTicker]/verify?wallet=xxx
 *
 * Verify that a wallet holds at least $50 worth of any outcome
 * for the given event. Returns position info if verified.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventTicker: string }> }
): Promise<NextResponse<VerificationResult>> {
  try {
    const { eventTicker } = await params;
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json({ verified: false, error: "Missing wallet address" });
    }

    if (!eventTicker) {
      return NextResponse.json({ verified: false, error: "Missing event ticker" });
    }

    // Get all positions for this wallet
    const positions = await getPositions(wallet);

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
