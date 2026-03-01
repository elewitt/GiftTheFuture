import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConnection } from "@/lib/solana";
import { getOutcomeMints } from "@/lib/dflow";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import crypto from "crypto";

const MAX_MESSAGES = 100;
const DFLOW_API = process.env.DFLOW_METADATA_API || "https://d.prediction-markets-api.dflow.net";

function getDFlowHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const apiKey = process.env.DFLOW_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

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
 * Verify wallet holds tokens for the market and return position info
 */
async function verifyPosition(
  wallet: string,
  eventTicker: string
): Promise<{ side: string; value: number; ticker: string } | null> {
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

  if (holdings.length === 0) {
    return null;
  }

  // Try direct market lookup first
  try {
    const mints = await getOutcomeMints(eventTicker);

    const yesHolding = holdings.find(h => h.mint === mints.yesMint);
    if (yesHolding) {
      return { side: "YES", value: yesHolding.balance, ticker: eventTicker };
    }

    const noHolding = holdings.find(h => h.mint === mints.noMint);
    if (noHolding) {
      return { side: "NO", value: noHolding.balance, ticker: eventTicker };
    }
  } catch {
    // Not a direct market ticker, try searching
  }

  // Search for matching markets using direct API call (same as /api/markets route)
  try {
    const res = await fetch(`${DFLOW_API}/api/v1/markets?status=active&limit=200`, {
      headers: getDFlowHeaders(),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[Chat Messages] Markets API error:", res.status);
      return null;
    }

    const data = await res.json();
    const allMarkets: { ticker: string; eventTicker?: string; title: string }[] = data.markets || data || [];
    const eventTickerUpper = eventTicker.toUpperCase();

    // Find matching markets
    const matchingMarkets = allMarkets.filter(m => {
      const ticker = (m.ticker || "").toUpperCase();
      const mEventTicker = (m.eventTicker || "").toUpperCase();
      return (
        ticker === eventTickerUpper ||
        ticker.startsWith(eventTickerUpper + "-") ||
        ticker.includes(eventTickerUpper) ||
        mEventTicker === eventTickerUpper ||
        mEventTicker.startsWith(eventTickerUpper) ||
        mEventTicker.includes(eventTickerUpper) ||
        (eventTickerUpper.includes("NBA") && ticker.includes("NBA")) ||
        (eventTickerUpper.includes("CHAMP") && ticker.includes("CHAMP"))
      );
    });

    for (const market of matchingMarkets) {
      try {
        const mints = await getOutcomeMints(market.ticker);

        // Extract outcome name from ticker or title
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

        const yesHolding = holdings.find(h => h.mint === mints.yesMint);
        if (yesHolding) {
          return { side: outcomeName, value: yesHolding.balance, ticker: market.ticker };
        }

        const noHolding = holdings.find(h => h.mint === mints.noMint);
        if (noHolding) {
          return { side: `NO ${outcomeName}`, value: noHolding.balance, ticker: market.ticker };
        }
      } catch {
        continue;
      }
    }
  } catch (e) {
    console.error("[Chat Messages] Failed to search markets:", e);
  }

  return null;
}

/**
 * POST /api/chat/[eventTicker]/messages
 *
 * Send a message to the chat room.
 * Requires holding any position in the market.
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
    const verifiedPosition = await verifyPosition(wallet, eventTicker);

    if (!verifiedPosition) {
      return NextResponse.json({
        error: "You need to hold tokens in this market to chat"
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
