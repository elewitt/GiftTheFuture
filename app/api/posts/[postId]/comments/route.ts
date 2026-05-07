import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ postId: string }>;
}

/**
 * GET /api/posts/[postId]/comments
 *
 * List comments on a post with pagination.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const parentId = searchParams.get("parentId"); // For fetching replies

    const currentUser = await getAuthUser(req);

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const comments = await prisma.comment.findMany({
      where: {
        postId,
        parentId: parentId || null, // Top-level or replies
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: "asc" },
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
    });

    const hasMore = comments.length > limit;
    const commentsList = hasMore ? comments.slice(0, -1) : comments;
    const nextCursor = hasMore ? commentsList[commentsList.length - 1]?.id : null;

    return NextResponse.json({
      comments: commentsList.map((c: any) => ({
        id: c.id,
        createdAt: c.createdAt,
        content: c.content,
        likeCount: c.likeCount,
        dislikeCount: c.dislikeCount,
        replyCount: c._count.replies,
        author: c.author,
        userLike: c.likes?.[0]?.isLike ?? null,
      })),
      nextCursor,
      hasMore,
    });
  } catch (error: any) {
    console.error("[/api/posts/[postId]/comments] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posts/[postId]/comments
 *
 * Add a comment to a post.
 * Body: { content: string, parentId?: string }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params;
    const currentUser = await requireAuth(req);

    const body = await req.json();
    const { content, parentId } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // If replying, check parent comment exists
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true },
      });

      if (!parentComment || parentComment.postId !== postId) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
    }

    // Create comment and update post comment count
    const [comment] = await prisma.$transaction([
      prisma.comment.create({
        data: {
          authorId: currentUser.id,
          postId,
          content: content.trim(),
          parentId,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({
      id: comment.id,
      createdAt: comment.createdAt,
      content: comment.content,
      likeCount: 0,
      dislikeCount: 0,
      replyCount: 0,
      author: comment.author,
      userLike: null,
    });
  } catch (error: any) {
    console.error("[/api/posts/[postId]/comments] Create Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to create comment" },
      { status: 500 }
    );
  }
}
