"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { FollowButton } from "@/components/feed/FollowButton";

interface ProfileHeaderProps {
  id: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  twitterHandle?: string | null;
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  onEditProfile?: () => void;
}

export function ProfileHeader({
  id,
  username,
  displayName,
  bio,
  avatarUrl,
  twitterHandle,
  instagramHandle,
  tiktokHandle,
  createdAt,
  followerCount,
  followingCount,
  postCount,
  isFollowing,
  isOwnProfile,
  onEditProfile,
}: ProfileHeaderProps) {
  const [currentFollowerCount, setCurrentFollowerCount] = useState(followerCount);

  const name = displayName || username || "Anonymous";
  const joinedDate = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  const handleFollowChange = (isFollowing: boolean) => {
    setCurrentFollowerCount((prev) => (isFollowing ? prev + 1 : prev - 1));
  };

  return (
    <div className="relative">
      {/* Cover image placeholder */}
      <div className="h-32 bg-gradient-to-br from-primary/20 to-accent/20 rounded-t-2xl" />

      {/* Profile content */}
      <div className="px-6 pb-6">
        {/* Avatar */}
        <div className="-mt-12 mb-4 flex items-end justify-between">
          <div className="w-24 h-24 rounded-2xl bg-card border-4 border-background overflow-hidden">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={name}
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground">
                <svg
                  className="w-10 h-10"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Action button */}
          {isOwnProfile ? (
            <Button variant="outline" size="sm" onClick={onEditProfile}>
              Edit Profile
            </Button>
          ) : (
            <FollowButton
              userId={id}
              isFollowing={isFollowing}
              onFollowChange={handleFollowChange}
              size="sm"
            />
          )}
        </div>

        {/* Name and username */}
        <div className="mb-3">
          <h1 className="text-xl font-bold text-foreground">{name}</h1>
          {username && (
            <p className="text-sm text-muted-foreground">@{username}</p>
          )}
        </div>

        {/* Bio */}
        {bio && (
          <p className="text-sm text-foreground/80 mb-4 whitespace-pre-wrap">
            {bio}
          </p>
        )}

        {/* Social Links */}
        {(twitterHandle || instagramHandle || tiktokHandle) && (
          <div className="flex gap-3 mb-4">
            {twitterHandle && (
              <a
                href={`https://x.com/${twitterHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{twitterHandle}
              </a>
            )}
            {instagramHandle && (
              <a
                href={`https://instagram.com/${instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
                @{instagramHandle}
              </a>
            )}
            {tiktokHandle && (
              <a
                href={`https://tiktok.com/@${tiktokHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
                </svg>
                @{tiktokHandle}
              </a>
            )}
          </div>
        )}

        {/* Join date */}
        <p className="text-xs text-muted-foreground mb-4">
          <svg
            className="w-4 h-4 inline mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          Joined {joinedDate}
        </p>

        {/* Stats */}
        <div className="flex gap-6">
          <Stat label="Posts" value={postCount} />
          <Stat label="Followers" value={currentFollowerCount} />
          <Stat label="Following" value={followingCount} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="font-bold text-foreground">{value}</span>{" "}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
