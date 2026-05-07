import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia",
});

/**
 * POST /api/checkout/create
 *
 * Creates a Stripe Checkout session for purchasing a position.
 * Supports two modes:
 * 1. Gift mode (default): Buy position and send to recipient email
 * 2. Self-purchase mode: Buy position directly to user's wallet
 *
 * Body: {
 *   marketTicker: string,
 *   marketTitle: string,
 *   side: "yes" | "no",
 *   shares: number,
 *   pricePerShare: number,
 *   recipientEmail: string (required for gift mode),
 *   recipientName: string,
 *   giftMessage: string,
 *   senderEmail: string,
 *   senderPrivyId: string,
 *   isSelfPurchase: boolean (optional, if true tokens go to user's wallet),
 *   userWalletAddress: string (required if isSelfPurchase is true),
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      marketTicker,
      marketTitle,
      side,
      shares,
      pricePerShare,
      recipientEmail,
      recipientName,
      giftMessage,
      senderEmail,
      senderPrivyId,
      isSelfPurchase,
      userWalletAddress,
    } = body;

    // Validate
    if (!marketTicker || !side || !shares) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // For self-purchase, require wallet address
    if (isSelfPurchase && !userWalletAddress) {
      return NextResponse.json(
        { error: "Wallet address required for self-purchase" },
        { status: 400 }
      );
    }

    // For gift mode, require recipient email
    if (!isSelfPurchase && !recipientEmail) {
      return NextResponse.json(
        { error: "Recipient email required for gifts" },
        { status: 400 }
      );
    }

    // Calculate total (price is in cents, e.g., 0.14 = 14 cents)
    const subtotal = shares * pricePerShare;
    const platformFee = 0; // Free during beta
    const total = subtotal + platformFee;
    const totalCents = Math.round(total * 100);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Stripe Checkout Session
    const productName = isSelfPurchase
      ? `Buy: ${marketTitle}`
      : `Gift: ${marketTitle}`;
    const productDescription = isSelfPurchase
      ? `${shares} ${side.toUpperCase()} shares`
      : `${shares} ${side.toUpperCase()} shares for ${recipientName || recipientEmail}`;
    const successUrl = `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = isSelfPurchase
      ? `${appUrl}/feed?canceled=true`
      : `${appUrl}/market/${encodeURIComponent(marketTicker)}?canceled=true`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
              description: productDescription,
              images: [],
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: senderEmail || undefined,
      metadata: {
        // Store purchase details for the webhook to process
        marketTicker,
        marketTitle,
        side,
        shares: shares.toString(),
        pricePerShare: pricePerShare.toString(),
        recipientEmail: recipientEmail || "",
        recipientName: recipientName || "",
        giftMessage: giftMessage || "",
        senderEmail: senderEmail || "",
        senderPrivyId: senderPrivyId || "",
        isSelfPurchase: isSelfPurchase ? "true" : "false",
        userWalletAddress: userWalletAddress || "",
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error("[/api/checkout/create] Error:", error);
    return NextResponse.json(
      { error: error.message || "Checkout creation failed" },
      { status: 500 }
    );
  }
}
