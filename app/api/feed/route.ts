import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, isUserSubscribed } from "@/lib/auth";

/**
 * GET /api/feed
 *
 * Fetch the social feed with cursor pagination.
 * Supports filtering by: all, following, channel
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const filter = searchParams.get("filter") || "all"; // all, following, channel
    const channelId = searchParams.get("channelId");

    // Get current user (optional for public feed)
    const currentUser = await getAuthUser(req);

    // Build where clause
    const where: any = {};

    if (filter === "following" && currentUser) {
      // Get IDs of users the current user follows
      const following = await prisma.follow.findMany({
        where: { followerId: currentUser.id },
        select: { followingId: true },
      });
      const followingIds = following.map((f) => f.followingId);
      where.authorId = { in: followingIds };
    }

    if (filter === "channel" && channelId) {
      where.channelId = channelId;
    }

    // Fetch posts
    const posts = await prisma.post.findMany({
      where,
      take: limit + 1, // Fetch one extra to check if there's more
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: "desc" },
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
            monthlyPrice: true,
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
        ...(currentUser && {
          likes: {
            where: { userId: currentUser.id },
            select: { isLike: true },
          },
        }),
      },
    });

    // Check for more posts
    const hasMore = posts.length > limit;
    const feedPosts = hasMore ? posts.slice(0, -1) : posts;
    const nextCursor = hasMore ? feedPosts[feedPosts.length - 1]?.id : null;

    // Filter out channel posts user isn't subscribed to
    const filteredPosts = await Promise.all(
      feedPosts.map(async (post) => {
        // If post is in a channel, check subscription
        if (post.channelId && post.channel) {
          // Channel owner always has access
          if (currentUser && post.authorId === currentUser.id) {
            return post;
          }

          // Check subscription
          if (currentUser) {
            const subscribed = await isUserSubscribed(currentUser.id, post.channelId);
            if (!subscribed) {
              // Return limited preview for non-subscribers
              return {
                ...post,
                content: post.content.slice(0, 100) + (post.content.length > 100 ? "..." : ""),
                mediaUrls: [],
                isLocked: true,
              };
            }
          } else {
            // Not logged in, show preview
            return {
              ...post,
              content: post.content.slice(0, 100) + (post.content.length > 100 ? "..." : ""),
              mediaUrls: [],
              isLocked: true,
            };
          }
        }
        return { ...post, isLocked: false };
      })
    );

    // Transform posts for response
    const transformedPosts = filteredPosts.map((post: any) => ({
      id: post.id,
      createdAt: post.createdAt,
      content: post.content,
      mediaUrls: post.mediaUrls,
      marketTicker: post.marketTicker,
      marketTitle: post.marketTitle,
      side: post.side,
      tokenAmount: post.tokenAmount,
      outcomeMint: post.outcomeMint,
      likeCount: post.likeCount,
      dislikeCount: post.dislikeCount,
      commentCount: post._count?.comments || post.commentCount,
      author: post.author,
      channel: post.channel,
      isLocked: post.isLocked || false,
      userLike: post.likes?.[0]?.isLike ?? null, // true = liked, false = disliked, null = no reaction
    }));

    return NextResponse.json({
      posts: transformedPosts,
      nextCursor,
      hasMore,
    });
  } catch (error: any) {
    console.error("[/api/feed] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch feed" },
      { status: 500 }
    );
  }
}
