import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, requireAuth } from "@/lib/auth";

/**
 * GET /api/channels
 *
 * List channels. By default returns the current user's channels.
 * Query params: userId (to get another user's channels)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const currentUser = await getAuthUser(req);

    const where: any = {};

    if (userId) {
      where.ownerId = userId;
    } else if (currentUser) {
      where.ownerId = currentUser.id;
    } else {
      // Return popular channels for non-authenticated users
      const channels = await prisma.channel.findMany({
        take: 20,
        orderBy: {
          subscriptions: {
            _count: "desc",
          },
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
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          avatarUrl: c.avatarUrl,
          monthlyPrice: c.monthlyPrice,
          owner: c.owner,
          subscriberCount: c._count.subscriptions,
          postCount: c._count.posts,
          isSubscribed: false,
        })),
      });
    }

    const channels = await prisma.channel.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
        ...(currentUser && {
          subscriptions: {
            where: { userId: currentUser.id },
            select: { expiresAt: true },
          },
        }),
      },
    });

    return NextResponse.json({
      channels: channels.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        avatarUrl: c.avatarUrl,
        monthlyPrice: c.monthlyPrice,
        owner: c.owner,
        subscriberCount: c._count.subscriptions,
        postCount: c._count.posts,
        isOwner: currentUser?.id === c.ownerId,
        isSubscribed:
          c.subscriptions?.[0] && new Date(c.subscriptions[0].expiresAt) > new Date(),
      })),
    });
  } catch (error: any) {
    console.error("[/api/channels] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch channels" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/channels
 *
 * Create a new channel.
 * Body: { name, description?, avatarUrl?, monthlyPrice }
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req);

    const body = await req.json();
    const { name, description, avatarUrl, monthlyPrice } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
    }

    if (typeof monthlyPrice !== "number" || monthlyPrice < 0) {
      return NextResponse.json(
        { error: "Monthly price must be a non-negative number (in cents)" },
        { status: 400 }
      );
    }

    const channel = await prisma.channel.create({
      data: {
        ownerId: currentUser.id,
        name: name.trim(),
        description: description?.trim() || null,
        avatarUrl: avatarUrl || null,
        monthlyPrice: Math.floor(monthlyPrice),
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
      },
    });

    return NextResponse.json({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      avatarUrl: channel.avatarUrl,
      monthlyPrice: channel.monthlyPrice,
      owner: channel.owner,
      subscriberCount: 0,
      postCount: 0,
      isOwner: true,
      isSubscribed: true, // Owner is always "subscribed"
    });
  } catch (error: any) {
    console.error("[/api/channels] Create Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to create channel" },
      { status: 500 }
    );
  }
}
