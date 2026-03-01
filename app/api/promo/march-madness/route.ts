import { NextResponse } from "next/server";
import { createOrder, getOutcomeMints, USDC_MINT } from "@/lib/dflow";
import {
  signAndSendDFlowTransaction,
  confirmTransaction,
  getServerKeypair,
} from "@/lib/solana";
import { createGift, updateGift } from "@/lib/gifts";

// March Madness 2025 event ticker - markets are like KXMARMAD-25-{TEAM}
const MARCH_MADNESS_EVENT = "KXMARMAD-25";

// Top teams for the dropdown (will be matched to market tickers)
const TOP_TEAMS: { name: string; ticker: string }[] = [
  { name: "Duke", ticker: "KXMARMAD-25-DUKE" },
  { name: "Auburn", ticker: "KXMARMAD-25-AUB" },
  { name: "Houston", ticker: "KXMARMAD-25-HOU" },
  { name: "Florida", ticker: "KXMARMAD-25-FLA" },
  { name: "Tennessee", ticker: "KXMARMAD-25-TENN" },
  { name: "Alabama", ticker: "KXMARMAD-25-BAMA" },
  { name: "Iowa State", ticker: "KXMARMAD-25-ISU" },
];

// Promo amount in USDC
const PROMO_AMOUNT_USDC = 1;

/**
 * GET /api/promo/march-madness
 *
 * Returns the list of available teams for the promo
 */
export async function GET() {
  return NextResponse.json({
    teams: TOP_TEAMS.map(t => ({ name: t.name, value: t.ticker })),
    amount: PROMO_AMOUNT_USDC,
    eventName: "2025 March Madness",
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
    const selectedTeam = TOP_TEAMS.find(t => t.ticker === teamTicker);
    if (!selectedTeam) {
      return NextResponse.json(
        { error: "Invalid team selection" },
        { status: 400 }
      );
    }

    console.log("[Promo] Creating March Madness gift:", {
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
    const marketTitle = `Will ${selectedTeam.name} win the 2025 NCAA Tournament?`;
    const gift = await createGift({
      marketTicker: teamTicker,
      marketTitle,
      side: "yes",
      outcomeMint: yesMint,
      tokenAmount: 0,
      costUSDC: PROMO_AMOUNT_USDC,
      senderPrivyId: "promo-march-madness",
      recipientName: "",
      recipientContact: recipientEmail,
      giftMessage: `${senderName} thinks ${selectedTeam.name} will win March Madness! Here's $1 on them.`,
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
          giftMessage: `${senderName} thinks ${selectedTeam.name} will win March Madness!`,
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
