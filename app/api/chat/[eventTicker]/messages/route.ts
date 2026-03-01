import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPositions } from "@/lib/solana";
import { getMarket } from "@/lib/dflow";
import crypto from "crypto";

const MINIMUM_POSITION_VALUE = 1; // $1 minimum (for testing)
const MAX_MESSAGES = 100;

interface ChatMessageResponse {
  id: string;
  content: string;
  createdAt: string;
  positionSide: string;
  positionValue: number;
}

/**
 * GET /api/chat/[eventTicker]/messages
 *
 * Fetch recent messages for an event's chat room.
 * No authentication required to view messages.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventTicker: string }> }
): Promise<NextResponse> {
  try {
    const { eventTicker } = await params;

    if (!eventTicker) {
      return NextResponse.json({ error: "Missing event ticker" }, { status: 400 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { eventTicker },
      orderBy: { createdAt: "desc" },
      take: MAX_MESSAGES,
    });

    // Return in chronological order
    const formattedMessages: ChatMessageResponse[] = messages
      .reverse()
      .map(msg => ({
        id: msg.id,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        positionSide: msg.positionSide,
        positionValue: msg.positionValue,
      }));

    return NextResponse.json({ messages: formattedMessages });

  } catch (error: any) {
    console.error("[/api/chat/messages GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/[eventTicker]/messages
 *
 * Send a message to the chat room.
 * Requires holding $50+ position in the event.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventTicker: string }> }
): Promise<NextResponse> {
  try {
    const { eventTicker } = await params;
    const body = await req.json();
    const { wallet, content } = body;

    if (!eventTicker) {
      return NextResponse.json({ error: "Missing event ticker" }, { status: 400 });
    }

    if (!wallet) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Missing message content" }, { status: 400 });
    }

    // Sanitize content
    const sanitizedContent = content.trim().slice(0, 500);
    if (sanitizedContent.length === 0) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    // Verify position
    const positions = await getPositions(wallet);
    const eventTickerUpper = eventTicker.toUpperCase();

    let verifiedPosition: { side: string; value: number; ticker: string } | null = null;

    for (const position of positions) {
      if (!position.market) continue;

      const marketTicker = position.market.ticker.toUpperCase();
      const matches = marketTicker === eventTickerUpper ||
                     marketTicker.startsWith(eventTickerUpper + "-") ||
                     marketTicker.startsWith(eventTickerUpper);

      if (!matches) continue;

      try {
        const market = await getMarket(position.market.ticker);
        const price = position.side === "YES"
          ? (market.yes_price ?? 0.5)
          : (market.no_price ?? 0.5);
        const value = position.balance * price;

        if (value >= MINIMUM_POSITION_VALUE) {
          // For multi-outcome markets, extract the outcome name from ticker
          // e.g., KXNBA-MVP-2025-SGIL -> SGIL (Shai Gilgeous-Alexander)
          let sideName: string = position.side;
          const tickerParts = position.market.ticker.split("-");
          if (tickerParts.length > 3) {
            // Use the last part as the outcome identifier
            sideName = tickerParts[tickerParts.length - 1];
          }

          verifiedPosition = {
            side: sideName,
            value: Math.round(value * 100) / 100,
            ticker: position.market.ticker,
          };
          break;
        }
      } catch {
        continue;
      }
    }

    if (!verifiedPosition) {
      return NextResponse.json({
        error: `You need at least $${MINIMUM_POSITION_VALUE} position to chat`
      }, { status: 403 });
    }

    // Hash wallet for privacy (same wallet = same hash for deduplication)
    const walletHash = crypto
      .createHash("sha256")
      .update(wallet.toLowerCase())
      .digest("hex")
      .slice(0, 16);

    // Create message
    const message = await prisma.chatMessage.create({
      data: {
        eventTicker,
        content: sanitizedContent,
        walletHash,
        positionSide: verifiedPosition.side,
        positionValue: verifiedPosition.value,
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        positionSide: message.positionSide,
        positionValue: message.positionValue,
      },
    });

  } catch (error: any) {
    console.error("[/api/chat/messages POST] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send message" },
      { status: 500 }
    );
  }
}
