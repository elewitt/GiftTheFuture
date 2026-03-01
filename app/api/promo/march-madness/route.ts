import { NextResponse } from "next/server";
import { createOrder, getOutcomeMints, USDC_MINT } from "@/lib/dflow";
import {
  signAndSendDFlowTransaction,
  confirmTransaction,
  getServerKeypair,
} from "@/lib/solana";
import { createGift, updateGift } from "@/lib/gifts";

const DFLOW_API = process.env.DFLOW_METADATA_API || "https://d.prediction-markets-api.dflow.net";

function getDFlowHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const apiKey = process.env.DFLOW_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

// Promo amount in USDC
const PROMO_AMOUNT_USDC = 1;

// Cache for teams (refreshed on each GET)
let cachedTeams: { name: string; ticker: string; title: string }[] = [];
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

async function fetchNBATeams(): Promise<{ name: string; ticker: string; title: string }[]> {
  // Return cached if fresh
  if (cachedTeams.length > 0 && Date.now() - cacheTime < CACHE_TTL) {
    return cachedTeams;
  }

  try {
    const res = await fetch(`${DFLOW_API}/api/v1/markets?status=active&limit=200`, {
      headers: getDFlowHeaders(),
    });

    if (!res.ok) return cachedTeams;

    const data = await res.json();
    const markets = data.markets || data || [];

    // Find NBA Finals markets (KXNBA-26-{TEAM})
    const nbaMarkets = markets.filter((m: any) => {
      const ticker = (m.ticker || "").toUpperCase();
      return ticker.includes("KXNBA") && ticker.includes("-26-");
    });

    // Extract team names from titles and sort by volume/probability
    const teams = nbaMarkets
      .map((m: any) => {
        // Extract team name from title like "Will the Oklahoma City win the 2026 Pro Basketball Finals?"
        const title = m.title || "";
        const match = title.match(/Will\s+(?:the\s+)?(.+?)\s+win/i);
        const teamName = match ? match[1] : m.ticker.split("-").pop();

        return {
          name: teamName,
          ticker: m.ticker,
          title: m.title,
          volume: m.volume || 0,
        };
      })
      .sort((a: any, b: any) => b.volume - a.volume)
      .slice(0, 7) // Top 7 by volume
      .map(({ name, ticker, title }: any) => ({ name, ticker, title }));

    if (teams.length > 0) {
      cachedTeams = teams;
      cacheTime = Date.now();
    }

    return teams;
  } catch (err) {
    console.error("[Promo] Failed to fetch NBA teams:", err);
    return cachedTeams;
  }
}

/**
 * GET /api/promo/march-madness
 *
 * Returns the list of available teams for the promo
 */
export async function GET() {
  const teams = await fetchNBATeams();

  return NextResponse.json({
    teams: teams.map(t => ({ name: t.name, value: t.ticker })),
    amount: PROMO_AMOUNT_USDC,
    eventName: "2026 NBA Finals",
  });
}

/**
 * POST /api/promo/march-madness
 *
 * Create a free $1 gift for March Madness
 *
 * Body: {
 *   recipientEmail: string,
 *   senderName: string,
 *   teamTicker: string,
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { recipientEmail, senderName, teamTicker } = body;

    // Validate required fields
    if (!recipientEmail || !senderName || !teamTicker) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!recipientEmail.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Validate team is in our allowed list
    const teams = await fetchNBATeams();
    const selectedTeam = teams.find(t => t.ticker === teamTicker);
    if (!selectedTeam) {
      return NextResponse.json(
        { error: "Invalid team selection" },
        { status: 400 }
      );
    }

    console.log("[Promo] Creating NBA Finals gift:", {
      recipientEmail,
      senderName,
      team: selectedTeam.name,
      ticker: teamTicker,
    });

    // 1. Get outcome token mint addresses
    let yesMint: string;
    try {
      const mints = await getOutcomeMints(teamTicker);
      yesMint = mints.yesMint;
    } catch (err) {
      console.error("[Promo] Failed to get mints for", teamTicker, err);
      return NextResponse.json(
        { error: "Market not available. Please try another team." },
        { status: 400 }
      );
    }

    // 2. Create gift record
    const marketTitle = selectedTeam.title || `Will ${selectedTeam.name} win the 2026 NBA Finals?`;
    const gift = await createGift({
      marketTicker: teamTicker,
      marketTitle,
      side: "yes",
      outcomeMint: yesMint,
      tokenAmount: 0,
      costUSDC: PROMO_AMOUNT_USDC,
      senderPrivyId: "promo-nba-finals",
      recipientName: "",
      recipientContact: recipientEmail,
      giftMessage: `${senderName} thinks ${selectedTeam.name} will win the NBA Finals! Here's $1 on them.`,
    });

    // 3. Create trade order via DFlow
    const serverKeypair = getServerKeypair();
    const amountLamports = Math.floor(PROMO_AMOUNT_USDC * 1_000_000);

    const orderResponse = await createOrder({
      inputMint: USDC_MINT,
      outputMint: yesMint,
      amount: amountLamports,
      slippageBps: 100, // 1% slippage for small orders
      userPublicKey: serverKeypair.publicKey.toBase58(),
    });

    // 4. Sign and submit transaction
    const signature = await signAndSendDFlowTransaction(
      orderResponse.transaction
    );

    await updateGift(gift.id, { purchaseTxSig: signature });

    // 5. Wait for confirmation
    console.log("[Promo] Confirming transaction:", signature);
    try {
      await confirmTransaction(signature);
      console.log("[Promo] Transaction confirmed");
    } catch (confirmErr) {
      console.error("[Promo] Transaction failed:", confirmErr);
      await updateGift(gift.id, { status: "expired" });
      return NextResponse.json(
        { error: "Transaction failed. Please try again." },
        { status: 500 }
      );
    }

    // 6. Update gift with token amount
    const tokensReceived = Number(orderResponse.outAmount || "0");
    if (tokensReceived <= 0) {
      await updateGift(gift.id, { status: "expired" });
      return NextResponse.json(
        { error: "Trade completed but received zero tokens" },
        { status: 500 }
      );
    }

    await updateGift(gift.id, {
      status: "pending_claim",
      tokenAmount: tokensReceived,
    });

    // 7. Send claim email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const claimUrl = `${appUrl}/gift/${gift.id}`;
    const TOKEN_DECIMALS = 6;
    const displayTokens = tokensReceived / Math.pow(10, TOKEN_DECIMALS);

    try {
      await fetch(`${appUrl}/api/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          recipientName: "Friend",
          senderName,
          marketTitle,
          side: "yes",
          shares: displayTokens,
          giftMessage: `${senderName} thinks ${selectedTeam.name} will win the NBA Finals!`,
          claimUrl,
        }),
      });
    } catch (emailError) {
      console.error("[Promo] Email send failed:", emailError);
    }

    console.log("[Promo] Gift created successfully:", gift.id);

    return NextResponse.json({
      success: true,
      giftId: gift.id,
      team: selectedTeam.name,
      shares: displayTokens,
    });

  } catch (error: any) {
    console.error("[Promo] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create gift" },
      { status: 500 }
    );
  }
}
