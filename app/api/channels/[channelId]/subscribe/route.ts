import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ channelId: string }>;
}

/**
 * POST /api/channels/[channelId]/subscribe
 *
 * Subscribe to a channel.
 * Body: { paymentTxSig?: string } - On-chain payment transaction signature
 *
 * For now, this creates/extends a subscription. In production, you'd verify
 * the payment transaction on-chain before creating the subscription.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { channelId } = await params;
    const currentUser = await requireAuth(req);

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, ownerId: true, monthlyPrice: true, name: true },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Owners don't need to subscribe
    if (channel.ownerId === currentUser.id) {
      return NextResponse.json({
        error: "You already have access as the channel owner",
      }, { status: 400 });
    }

    const body = await req.json();
    const { paymentTxSig } = body;

    // Check for existing subscription
    const existingSubscription = await prisma.subscription.findUnique({
      where: {
        userId_channelId: {
          userId: currentUser.id,
          channelId,
        },
      },
    });

    const now = new Date();
    const oneMonthFromNow = new Date(now);
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    if (existingSubscription) {
      // Extend subscription
      const newExpiry = existingSubscription.expiresAt > now
        ? new Date(existingSubscription.expiresAt)
        : new Date(now);
      newExpiry.setMonth(newExpiry.getMonth() + 1);

      const updatedSubscription = await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          expiresAt: newExpiry,
          paymentTxSig: paymentTxSig || existingSubscription.paymentTxSig,
          amountPaid: existingSubscription.amountPaid + channel.monthlyPrice,
        },
      });

      return NextResponse.json({
        subscribed: true,
        expiresAt: updatedSubscription.expiresAt,
        message: "Subscription extended",
      });
    } else {
      // Create new subscription
      const subscription = await prisma.subscription.create({
        data: {
          userId: currentUser.id,
          channelId,
          expiresAt: oneMonthFromNow,
          paymentTxSig: paymentTxSig || null,
          amountPaid: channel.monthlyPrice,
        },
      });

      return NextResponse.json({
        subscribed: true,
        expiresAt: subscription.expiresAt,
        message: `Subscribed to ${channel.name}`,
      });
    }
  } catch (error: any) {
    console.error("[/api/channels/[channelId]/subscribe] Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to subscribe" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/channels/[channelId]/subscribe
 *
 * Cancel subscription (won't refund, just prevents auto-renewal).
 * For now, this deletes the subscription entirely.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { channelId } = await params;
    const currentUser = await requireAuth(req);

    const subscription = await prisma.subscription.findUnique({
      where: {
        userId_channelId: {
          userId: currentUser.id,
          channelId,
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    await prisma.subscription.delete({
      where: { id: subscription.id },
    });

    return NextResponse.json({
      subscribed: false,
      message: "Subscription cancelled",
    });
  } catch (error: any) {
    console.error("[/api/channels/[channelId]/subscribe] Delete Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
