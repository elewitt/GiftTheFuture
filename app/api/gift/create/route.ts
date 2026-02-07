import { NextResponse } from "next/server";
import { createOrder, getOutcomeMints, USDC_MINT, getOrderStatus } from "@/lib/dflow";
import { signAndSendDFlowTransaction, confirmTransaction, getServerKeypair } from "@/lib/solana";
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

    // 5. Wait for fill
    let filled = false;

    if (orderResponse.executionMode === "sync") {
      await confirmTransaction(signature);
      filled = true;
    } else {
      // Async: poll DFlow for fill status
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await getOrderStatus(signature);
          if (status.status === "filled") {
            filled = true;
            break;
          }
          if (status.status === "failed") {
            throw new Error("DFlow order fill failed");
          }
        } catch {
          // Keep polling
        }
      }
    }

    if (!filled) {
      await updateGift(gift.id, { status: "expired" });
      return NextResponse.json(
        { error: "Order not confirmed in time" },
        { status: 504 }
      );
    }

    // 6. Update gift to pending_claim
    const tokensReceived = parseInt(orderResponse.quote.outputAmount || "0");
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

    return NextResponse.json({
      giftId: gift.id,
      claimUrl,
      signature,
      tokensReceived,
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
