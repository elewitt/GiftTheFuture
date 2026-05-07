import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, getOrCreateUser, getPrivyIdFromRequest } from "@/lib/auth";

/**
 * GET /api/users/me
 *
 * Get the current user's profile.
 */
export async function GET(req: NextRequest) {
  try {
    const privyId = getPrivyIdFromRequest(req);
    if (!privyId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { privyId },
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
      // Create user if doesn't exist
      const newUser = await getOrCreateUser(privyId);
      return NextResponse.json({
        ...newUser,
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
      });
    }

    return NextResponse.json({
      id: user.id,
      privyId: user.privyId,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      twitterHandle: user.twitterHandle,
      instagramHandle: user.instagramHandle,
      tiktokHandle: user.tiktokHandle,
      onboardingComplete: user.onboardingComplete,
      createdAt: user.createdAt,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      postCount: user._count.posts,
    });
  } catch (error: any) {
    console.error("[/api/users/me] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/me
 *
 * Update the current user's profile.
 * Body: { username?, displayName?, bio?, avatarUrl? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req);

    const body = await req.json();
    const { username, displayName, bio, avatarUrl, twitterHandle, instagramHandle, tiktokHandle, onboardingComplete } = body;

    // Validate username if provided
    if (username !== undefined) {
      if (username === null || username === "") {
        // Allow clearing username
      } else {
        // Validate username format
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
          return NextResponse.json(
            {
              error:
                "Username must be 3-20 characters and contain only letters, numbers, and underscores",
            },
            { status: 400 }
          );
        }

        // Check if username is taken
        const existingUser = await prisma.user.findUnique({
          where: { username },
          select: { id: true },
        });

        if (existingUser && existingUser.id !== currentUser.id) {
          return NextResponse.json({ error: "Username is already taken" }, { status: 400 });
        }
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        ...(username !== undefined && { username: username || null }),
        ...(displayName !== undefined && { displayName: displayName || null }),
        ...(bio !== undefined && { bio: bio || null }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
        ...(twitterHandle !== undefined && { twitterHandle: twitterHandle || null }),
        ...(instagramHandle !== undefined && { instagramHandle: instagramHandle || null }),
        ...(tiktokHandle !== undefined && { tiktokHandle: tiktokHandle || null }),
        ...(onboardingComplete !== undefined && { onboardingComplete }),
      },
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

    return NextResponse.json({
      id: updatedUser.id,
      privyId: updatedUser.privyId,
      email: updatedUser.email,
      username: updatedUser.username,
      displayName: updatedUser.displayName,
      bio: updatedUser.bio,
      avatarUrl: updatedUser.avatarUrl,
      twitterHandle: updatedUser.twitterHandle,
      instagramHandle: updatedUser.instagramHandle,
      tiktokHandle: updatedUser.tiktokHandle,
      onboardingComplete: updatedUser.onboardingComplete,
      createdAt: updatedUser.createdAt,
      followerCount: updatedUser._count.followers,
      followingCount: updatedUser._count.following,
      postCount: updatedUser._count.posts,
    });
  } catch (error: any) {
    console.error("[/api/users/me] Update Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to update profile" },
      { status: 500 }
    );
  }
}
