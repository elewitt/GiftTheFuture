import { NextResponse } from "next/server";
import { createOrder, getOutcomeMints, USDC_MINT } from "@/lib/dflow";
import {
  signAndSendDFlowTransaction,
  confirmTransaction,
  getServerKeypair,
} from "@/lib/solana";
import { createGift, updateGift } from "@/lib/gifts";

/**
 * POST /api/gift/create
 *
 * The core gifting flow:
 * 1. Look up outcome token mints from DFlow
 * 2. Buy outcome tokens via DFlow Trade API
 * 3. Sign and submit the transaction
 * 4. Wait for fill confirmation
 * 5. Store gift record, return claim URL
 *
 * Body: {
 *   marketTicker: string,
 *   marketTitle: string,
 *   side: "yes" | "no",
 *   amountUSDC: number,
 *   recipientContact: string,
 *   recipientName: string,
 *   giftMessage: string,
 *   senderPrivyId: string,
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      marketTicker,
      marketTitle,
      side,
      amountUSDC,
      recipientContact,
      recipientName,
      giftMessage,
      senderPrivyId,
    } = body;

    // Validate
    if (!marketTicker || !side || !amountUSDC || !recipientContact) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (side !== "yes" && side !== "no") {
      return NextResponse.json(
        { error: "Side must be 'yes' or 'no'" },
        { status: 400 }
      );
    }

    // 1. Get outcome token mint addresses
    const { yesMint, noMint } = await getOutcomeMints(marketTicker);
    const outputMint = side === "yes" ? yesMint : noMint;

    // 2. Create gift record (pending_payment)
    const gift = await createGift({
      marketTicker,
      marketTitle: marketTitle || marketTicker,
      side,
      outcomeMint: outputMint,
      tokenAmount: 0, // Updated after fill
      costUSDC: amountUSDC,
      senderPrivyId: senderPrivyId || "anonymous",
      recipientName: recipientName || "",
      recipientContact,
      giftMessage: giftMessage || "",
    });

    // 3. Create trade order via DFlow
    const serverKeypair = getServerKeypair();
    const amountLamports = Math.floor(amountUSDC * 1_000_000); // USDC = 6 decimals

    const orderResponse = await createOrder({
      inputMint: USDC_MINT,
      outputMint,
      amount: amountLamports,
      slippageBps: 50,
      userPublicKey: serverKeypair.publicKey.toBase58(),
    });

    // 4. Sign and submit transaction
    const signature = await signAndSendDFlowTransaction(
      orderResponse.transaction
    );

    await updateGift(gift.id, { purchaseTxSig: signature });

    // 5. Wait for on-chain confirmation
    console.log("[Gift Create] Confirming transaction:", signature);
    try {
      await confirmTransaction(signature);
      console.log("[Gift Create] Transaction confirmed on-chain");
    } catch (confirmErr) {
      console.error("[Gift Create] Transaction failed:", confirmErr);
      await updateGift(gift.id, { status: "expired" });
      return NextResponse.json(
        { error: "Transaction failed on-chain" },
        { status: 500 }
      );
    }

    // 6. Update gift to pending_claim
    // Parse the output amount from DFlow quote (returned as string)
    const tokensReceived = Number(orderResponse.quote.outputAmount || "0");

    if (tokensReceived <= 0) {
      console.error("[Gift Create] Invalid token amount from quote:", orderResponse.quote);
      await updateGift(gift.id, { status: "expired" });
      return NextResponse.json(
        { error: "Trade completed but received zero tokens" },
        { status: 500 }
      );
    }

    console.log("[Gift Create] Tokens received:", tokensReceived, "for gift:", gift.id);

    await updateGift(gift.id, {
      status: "pending_claim",
      tokenAmount: tokensReceived,
    });

    // 7. Send claim notification email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const claimUrl = `${appUrl}/gift/${gift.id}`;

    // Send email if it looks like an email address
    if (recipientContact.includes("@")) {
      try {
        await fetch(`${appUrl}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipientContact,
            recipientName,
            senderName: "A friend", // Could fetch from Privy user
            marketTitle,
            side,
            shares: tokensReceived,
            giftMessage,
            claimUrl,
          }),
        });
      } catch (emailError) {
        console.error("[Gift Create] Email send failed:", emailError);
        // Don't fail the gift creation if email fails
      }
    }

    // Convert raw token amount to human-readable (DFlow tokens have 6 decimals)
    const TOKEN_DECIMALS = 6;
    const displayTokensReceived = tokensReceived / Math.pow(10, TOKEN_DECIMALS);

    return NextResponse.json({
      giftId: gift.id,
      claimUrl,
      signature,
      tokensReceived: displayTokensReceived, // Human-readable (e.g., 8.0 shares)
      rawTokensReceived: tokensReceived, // Raw amount
      executionMode: orderResponse.executionMode,
    });
  } catch (error: any) {
    console.error("[/api/gift/create] Error:", error);
    return NextResponse.json(
      { error: error.message || "Gift creation failed" },
      { status: 500 }
    );
  }
}
