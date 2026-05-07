/**
 * Authentication Utilities
 *
 * Helpers for extracting and validating Privy authentication from requests.
 * Integrates with Prisma to fetch user profiles.
 */

import { NextRequest } from "next/server";
import prisma from "./prisma";

export interface AuthUser {
  id: string;
  privyId: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

/**
 * Extract the Privy user ID from the request.
 * In a production app, you'd verify the JWT token from Privy.
 * For now, we accept the privyId from headers or query params.
 */
export function getPrivyIdFromRequest(req: NextRequest): string | null {
  // Check Authorization header first (Bearer token pattern)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check X-Privy-Id header
  const privyIdHeader = req.headers.get("x-privy-id");
  if (privyIdHeader) {
    return privyIdHeader;
  }

  // Check query params as fallback
  const url = new URL(req.url);
  const privyIdParam = url.searchParams.get("privyId");
  if (privyIdParam) {
    return privyIdParam;
  }

  return null;
}

/**
 * Get the authenticated user from the request.
 * Returns null if not authenticated.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const privyId = getPrivyIdFromRequest(req);
  if (!privyId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { privyId },
    select: {
      id: true,
      privyId: true,
      email: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
    },
  });

  return user;
}

/**
 * Require authentication. Throws if not authenticated.
 * Auto-creates user record if they don't exist in the database.
 */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  const privyId = getPrivyIdFromRequest(req);
  if (!privyId) {
    throw new Error("Authentication required");
  }

  // Auto-create user if they don't exist
  const user = await getOrCreateUser(privyId);
  return user;
}

/**
 * Get or create a user by Privy ID.
 * Creates a new user record if one doesn't exist.
 */
export async function getOrCreateUser(privyId: string, email?: string): Promise<AuthUser> {
  let user = await prisma.user.findUnique({
    where: { privyId },
    select: {
      id: true,
      privyId: true,
      email: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
    },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        privyId,
        email: email || null,
      },
      select: {
        id: true,
        privyId: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
      },
    });
  }

  return user;
}

/**
 * Get user with full profile data including follower/following counts.
 */
export async function getUserWithProfile(privyId: string) {
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

  return user;
}

/**
 * Get user by username.
 */
export async function getUserByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
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

  return user;
}

/**
 * Check if a user is subscribed to a channel.
 */
export async function isUserSubscribed(userId: string, channelId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({
    where: {
      userId_channelId: {
        userId,
        channelId,
      },
    },
  });

  if (!subscription) {
    return false;
  }

  // Check if subscription is still active
  return subscription.expiresAt > new Date();
}

/**
 * Check if a user follows another user.
 */
export async function isUserFollowing(followerId: string, followingId: string): Promise<boolean> {
  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  return !!follow;
}
