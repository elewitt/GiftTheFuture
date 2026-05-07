import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, isUserFollowing } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

/**
 * GET /api/users/[userId]
 *
 * Get a user's public profile.
 * userId can be the user's ID or username.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params;
    const currentUser = await getAuthUser(req);

    // Try to find by ID first, then by username
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { username: userId },
        include: {
          _count: {
            select: {
              followers: true,
              following: true,
              posts: true,
            },
          },
        },
      });
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if current user follows this user
    let isFollowing = false;
    if (currentUser && currentUser.id !== user.id) {
      isFollowing = await isUserFollowing(currentUser.id, user.id);
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      twitterHandle: user.twitterHandle,
      instagramHandle: user.instagramHandle,
      tiktokHandle: user.tiktokHandle,
      createdAt: user.createdAt,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      postCount: user._count.posts,
      isFollowing,
      isOwnProfile: currentUser?.id === user.id,
    });
  } catch (error: any) {
    console.error("[/api/users/[userId]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch user" },
      { status: 500 }
    );
  }
}
