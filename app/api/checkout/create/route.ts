import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

/**
 * POST /api/checkout/create
 * 
 * Creates a Stripe Checkout session for purchasing a gift.
 * After successful payment, we'll buy the position via DFlow and send the gift.
 * 
 * Body: {
 *   marketTicker: string,
 *   marketTitle: string,
 *   side: "yes" | "no",
 *   shares: number,
 *   pricePerShare: number,
 *   recipientEmail: string,
 *   recipientName: string,
 *   giftMessage: string,
 *   senderEmail: string,
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
    } = body;

    // Validate
    if (!marketTicker || !side || !shares || !recipientEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
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
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Gift: ${marketTitle}`,
              description: `${shares} ${side.toUpperCase()} shares for ${recipientName || recipientEmail}`,
              images: [], // Could add a preview image
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/market/${encodeURIComponent(marketTicker)}?canceled=true`,
      customer_email: senderEmail || undefined,
      metadata: {
        // Store gift details for the webhook to process
        marketTicker,
        marketTitle,
        side,
        shares: shares.toString(),
        pricePerShare: pricePerShare.toString(),
        recipientEmail,
        recipientName: recipientName || "",
        giftMessage: giftMessage || "",
        senderEmail: senderEmail || "",
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
