import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, isUserSubscribed } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ postId: string }>;
}

/**
 * GET /api/posts/[postId]
 *
 * Get a single post with comments.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params;
    const currentUser = await getAuthUser(req);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            monthlyPrice: true,
          },
        },
        comments: {
          where: { parentId: null }, // Top-level comments only
          take: 20,
          orderBy: { createdAt: "desc" },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            _count: {
              select: { replies: true },
            },
            ...(currentUser && {
              likes: {
                where: { userId: currentUser.id },
                select: { isLike: true },
              },
            }),
          },
        },
        _count: {
          select: { comments: true },
        },
        ...(currentUser && {
          likes: {
            where: { userId: currentUser.id },
            select: { isLike: true },
          },
        }),
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check channel access
    let isLocked = false;
    if (post.channelId && post.channel) {
      const isOwner = currentUser && post.authorId === currentUser.id;
      const isSubscribed = currentUser
        ? await isUserSubscribed(currentUser.id, post.channelId)
        : false;

      if (!isOwner && !isSubscribed) {
        isLocked = true;
      }
    }

    return NextResponse.json({
      id: post.id,
      createdAt: post.createdAt,
      content: isLocked
        ? post.content.slice(0, 100) + (post.content.length > 100 ? "..." : "")
        : post.content,
      mediaUrls: isLocked ? [] : post.mediaUrls,
      marketTicker: post.marketTicker,
      marketTitle: post.marketTitle,
      side: post.side,
      tokenAmount: post.tokenAmount,
      outcomeMint: post.outcomeMint,
      likeCount: post.likeCount,
      dislikeCount: post.dislikeCount,
      commentCount: post._count.comments,
      author: post.author,
      channel: post.channel,
      isLocked,
      userLike: (post as any).likes?.[0]?.isLike ?? null,
      comments: isLocked
        ? []
        : post.comments.map((c: any) => ({
            id: c.id,
            createdAt: c.createdAt,
            content: c.content,
            likeCount: c.likeCount,
            dislikeCount: c.dislikeCount,
            replyCount: c._count.replies,
            author: c.author,
            userLike: c.likes?.[0]?.isLike ?? null,
          })),
    });
  } catch (error: any) {
    console.error("[/api/posts/[postId]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch post" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[postId]
 *
 * Delete a post (only by author).
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params;
    const currentUser = await getAuthUser(req);

    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.authorId !== currentUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await prisma.post.delete({
      where: { id: postId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/posts/[postId]] Delete Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete post" },
      { status: 500 }
    );
  }
}
