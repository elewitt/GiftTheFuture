import { NextResponse } from "next/server";
import { getPositions, Position } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

// No minimum - just need to hold any tokens

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

    // User has matching positions - they're verified!
    // Use the first/largest position for display
    const position = matchingPositions[0];

    return NextResponse.json({
      verified: true,
      position: {
        side: position.side,
        value: position.balance, // Just show token count
        ticker: position.market?.ticker || eventTicker,
      },
    });

  } catch (error: any) {
    console.error("[/api/chat/verify] Error:", error);
    return NextResponse.json({
      verified: false,
      error: error.message || "Verification failed"
    });
  }
}
