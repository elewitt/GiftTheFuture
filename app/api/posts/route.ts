import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, getOrCreateUser, isUserSubscribed } from "@/lib/auth";
import { getPositions } from "@/lib/solana";

/**
 * POST /api/posts
 *
 * Create a new post with a required bet attachment.
 * Verifies that the user holds tokens for the specified market.
 */
export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const authUser = await requireAuth(req);

    const body = await req.json();
    const {
      content,
      mediaUrls = [],
      marketTicker,
      marketTitle,
      side,
      tokenAmount,
      outcomeMint,
      walletAddress,
      channelId,
    } = body;

    // Validate required fields
    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (!marketTicker || !side || !outcomeMint) {
      return NextResponse.json(
        { error: "Bet information is required (marketTicker, side, outcomeMint)" },
        { status: 400 }
      );
    }

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    // Verify user holds tokens for this market
    const positions = await getPositions(walletAddress);
    const matchingPosition = positions.find(
      (p) => p.mint === outcomeMint && p.balance > 0
    );

    if (!matchingPosition) {
      return NextResponse.json(
        { error: "You must hold tokens for this position to post about it" },
        { status: 400 }
      );
    }

    // Check if user has already posted about this position
    const existingPost = await prisma.post.findFirst({
      where: {
        authorId: authUser.id,
        outcomeMint: outcomeMint,
      },
    });

    if (existingPost) {
      return NextResponse.json(
        { error: "You've already shared this position" },
        { status: 400 }
      );
    }

    // Verify token amount doesn't exceed balance
    const actualTokenAmount = tokenAmount || matchingPosition.balance;
    if (actualTokenAmount > matchingPosition.balance) {
      return NextResponse.json(
        { error: "Token amount exceeds your balance" },
        { status: 400 }
      );
    }

    // If posting to a channel, verify ownership
    if (channelId) {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { ownerId: true },
      });

      if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }

      if (channel.ownerId !== authUser.id) {
        return NextResponse.json(
          { error: "You can only post to channels you own" },
          { status: 403 }
        );
      }
    }

    // Create the post
    const post = await prisma.post.create({
      data: {
        authorId: authUser.id,
        content: content.trim(),
        mediaUrls,
        marketTicker,
        marketTitle: marketTitle || matchingPosition.market?.title || marketTicker,
        side: side.toUpperCase(),
        tokenAmount: actualTokenAmount,
        outcomeMint,
        channelId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            twitterHandle: true,
            instagramHandle: true,
            tiktokHandle: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: post.id,
      createdAt: post.createdAt,
      content: post.content,
      mediaUrls: post.mediaUrls,
      marketTicker: post.marketTicker,
      marketTitle: post.marketTitle,
      side: post.side,
      tokenAmount: post.tokenAmount,
      outcomeMint: post.outcomeMint,
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
      author: post.author,
      channel: post.channel,
    });
  } catch (error: any) {
    console.error("[/api/posts] Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to create post" },
      { status: 500 }
    );
  }
}
