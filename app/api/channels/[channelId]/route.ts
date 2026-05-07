import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, requireAuth, isUserSubscribed } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ channelId: string }>;
}

/**
 * GET /api/channels/[channelId]
 *
 * Get channel info and subscription status.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { channelId } = await params;
    const currentUser = await getAuthUser(req);

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            subscriptions: true,
            posts: true,
          },
        },
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Check subscription status
    let isSubscribed = false;
    let subscriptionExpiresAt = null;

    if (currentUser) {
      if (channel.ownerId === currentUser.id) {
        isSubscribed = true; // Owner always has access
      } else {
        const subscription = await prisma.subscription.findUnique({
          where: {
            userId_channelId: {
              userId: currentUser.id,
              channelId,
            },
          },
        });

        if (subscription && subscription.expiresAt > new Date()) {
          isSubscribed = true;
          subscriptionExpiresAt = subscription.expiresAt;
        }
      }
    }

    return NextResponse.json({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      avatarUrl: channel.avatarUrl,
      monthlyPrice: channel.monthlyPrice,
      createdAt: channel.createdAt,
      owner: channel.owner,
      subscriberCount: channel._count.subscriptions,
      postCount: channel._count.posts,
      isOwner: currentUser?.id === channel.ownerId,
      isSubscribed,
      subscriptionExpiresAt,
    });
  } catch (error: any) {
    console.error("[/api/channels/[channelId]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch channel" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/channels/[channelId]
 *
 * Update a channel (owner only).
 * Body: { name?, description?, avatarUrl?, monthlyPrice? }
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { channelId } = await params;
    const currentUser = await requireAuth(req);

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { ownerId: true },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (channel.ownerId !== currentUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, avatarUrl, monthlyPrice } = body;

    const updatedChannel = await prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
        ...(monthlyPrice !== undefined && { monthlyPrice: Math.floor(monthlyPrice) }),
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            subscriptions: true,
            posts: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: updatedChannel.id,
      name: updatedChannel.name,
      description: updatedChannel.description,
      avatarUrl: updatedChannel.avatarUrl,
      monthlyPrice: updatedChannel.monthlyPrice,
      createdAt: updatedChannel.createdAt,
      owner: updatedChannel.owner,
      subscriberCount: updatedChannel._count.subscriptions,
      postCount: updatedChannel._count.posts,
      isOwner: true,
      isSubscribed: true,
    });
  } catch (error: any) {
    console.error("[/api/channels/[channelId]] Update Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to update channel" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/channels/[channelId]
 *
 * Delete a channel (owner only).
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { channelId } = await params;
    const currentUser = await requireAuth(req);

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { ownerId: true },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (channel.ownerId !== currentUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await prisma.channel.delete({
      where: { id: channelId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/channels/[channelId]] Delete Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to delete channel" },
      { status: 500 }
    );
  }
}
