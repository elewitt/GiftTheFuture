import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

/**
 * POST /api/users/[userId]/follow
 *
 * Follow a user.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params;
    const currentUser = await requireAuth(req);

    // Can't follow yourself
    if (userId === currentUser.id) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUser.id,
          followingId: userId,
        },
      },
    });

    if (existingFollow) {
      return NextResponse.json({ error: "Already following this user" }, { status: 400 });
    }

    // Create follow
    await prisma.follow.create({
      data: {
        followerId: currentUser.id,
        followingId: userId,
      },
    });

    // Get updated follower count
    const followerCount = await prisma.follow.count({
      where: { followingId: userId },
    });

    return NextResponse.json({
      following: true,
      followerCount,
    });
  } catch (error: any) {
    console.error("[/api/users/[userId]/follow] Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to follow user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[userId]/follow
 *
 * Unfollow a user.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params;
    const currentUser = await requireAuth(req);

    // Check if following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUser.id,
          followingId: userId,
        },
      },
    });

    if (!existingFollow) {
      return NextResponse.json({ error: "Not following this user" }, { status: 400 });
    }

    // Delete follow
    await prisma.follow.delete({
      where: { id: existingFollow.id },
    });

    // Get updated follower count
    const followerCount = await prisma.follow.count({
      where: { followingId: userId },
    });

    return NextResponse.json({
      following: false,
      followerCount,
    });
  } catch (error: any) {
    console.error("[/api/users/[userId]/follow] Delete Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to unfollow user" },
      { status: 500 }
    );
  }
}
