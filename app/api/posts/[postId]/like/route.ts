import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ postId: string }>;
}

/**
 * POST /api/posts/[postId]/like
 *
 * Like or dislike a post.
 * Body: { isLike: boolean }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params;
    const currentUser = await requireAuth(req);

    const body = await req.json();
    const { isLike } = body;

    if (typeof isLike !== "boolean") {
      return NextResponse.json({ error: "isLike must be a boolean" }, { status: 400 });
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, likeCount: true, dislikeCount: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check for existing like
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: currentUser.id,
          postId,
        },
      },
    });

    if (existingLike) {
      if (existingLike.isLike === isLike) {
        // Same reaction, remove it
        await prisma.$transaction([
          prisma.like.delete({
            where: { id: existingLike.id },
          }),
          prisma.post.update({
            where: { id: postId },
            data: {
              likeCount: isLike ? { decrement: 1 } : undefined,
              dislikeCount: !isLike ? { decrement: 1 } : undefined,
            },
          }),
        ]);

        return NextResponse.json({
          liked: null,
          likeCount: post.likeCount + (isLike ? -1 : 0),
          dislikeCount: post.dislikeCount + (!isLike ? -1 : 0),
        });
      } else {
        // Different reaction, update it
        await prisma.$transaction([
          prisma.like.update({
            where: { id: existingLike.id },
            data: { isLike },
          }),
          prisma.post.update({
            where: { id: postId },
            data: {
              likeCount: isLike ? { increment: 1 } : { decrement: 1 },
              dislikeCount: !isLike ? { increment: 1 } : { decrement: 1 },
            },
          }),
        ]);

        return NextResponse.json({
          liked: isLike,
          likeCount: post.likeCount + (isLike ? 1 : -1),
          dislikeCount: post.dislikeCount + (!isLike ? 1 : -1),
        });
      }
    } else {
      // New reaction
      await prisma.$transaction([
        prisma.like.create({
          data: {
            userId: currentUser.id,
            postId,
            isLike,
          },
        }),
        prisma.post.update({
          where: { id: postId },
          data: {
            likeCount: isLike ? { increment: 1 } : undefined,
            dislikeCount: !isLike ? { increment: 1 } : undefined,
          },
        }),
      ]);

      return NextResponse.json({
        liked: isLike,
        likeCount: post.likeCount + (isLike ? 1 : 0),
        dislikeCount: post.dislikeCount + (!isLike ? 1 : 0),
      });
    }
  } catch (error: any) {
    console.error("[/api/posts/[postId]/like] Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to like post" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[postId]/like
 *
 * Remove like/dislike from a post.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params;
    const currentUser = await requireAuth(req);

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: currentUser.id,
          postId,
        },
      },
    });

    if (!existingLike) {
      return NextResponse.json({ error: "No like found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.like.delete({
        where: { id: existingLike.id },
      }),
      prisma.post.update({
        where: { id: postId },
        data: {
          likeCount: existingLike.isLike ? { decrement: 1 } : undefined,
          dislikeCount: !existingLike.isLike ? { decrement: 1 } : undefined,
        },
      }),
    ]);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true, dislikeCount: true },
    });

    return NextResponse.json({
      liked: null,
      likeCount: post?.likeCount ?? 0,
      dislikeCount: post?.dislikeCount ?? 0,
    });
  } catch (error: any) {
    console.error("[/api/posts/[postId]/like] Delete Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to remove like" },
      { status: 500 }
    );
  }
}
