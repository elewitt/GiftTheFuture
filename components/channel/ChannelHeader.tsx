"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { SubscribeButton } from "./SubscribeButton";

interface ChannelHeaderProps {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  monthlyPrice: number;
  createdAt: string;
  owner: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  subscriberCount: number;
  postCount: number;
  isOwner: boolean;
  isSubscribed: boolean;
  subscriptionExpiresAt?: string | null;
  onEdit?: () => void;
}

export function ChannelHeader({
  id,
  name,
  description,
  avatarUrl,
  monthlyPrice,
  createdAt,
  owner,
  subscriberCount,
  postCount,
  isOwner,
  isSubscribed,
  subscriptionExpiresAt,
  onEdit,
}: ChannelHeaderProps) {
  const ownerName = owner.displayName || owner.username || "Anonymous";
  const createdDate = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  return (
    <div className="relative">
      {/* Cover */}
      <div className="h-32 bg-gradient-to-br from-primary/20 to-accent/20 rounded-t-2xl" />

      {/* Content */}
      <div className="px-6 pb-6">
        {/* Avatar and actions */}
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
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
            )}
          </div>

          {isOwner ? (
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit Channel
            </Button>
          ) : (
            <SubscribeButton
              channelId={id}
              monthlyPrice={monthlyPrice}
              isSubscribed={isSubscribed}
            />
          )}
        </div>

        {/* Name */}
        <h1 className="text-xl font-bold text-foreground mb-1">{name}</h1>

        {/* Owner */}
        <Link
          href={owner.username ? `/profile/${owner.username}` : "#"}
          className="text-sm text-muted-foreground hover:text-foreground transition"
        >
          by {ownerName}
        </Link>

        {/* Description */}
        {description && (
          <p className="text-sm text-foreground/80 mt-3 whitespace-pre-wrap">
            {description}
          </p>
        )}

        {/* Stats and meta */}
        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
          <span>{subscriberCount} subscribers</span>
          <span>{postCount} posts</span>
          <span>Created {createdDate}</span>
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
            ${(monthlyPrice / 100).toFixed(2)}/month
          </span>
        </div>

        {/* Subscription status */}
        {isSubscribed && subscriptionExpiresAt && (
          <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-primary">
              Your subscription expires{" "}
              {formatDistanceToNow(new Date(subscriptionExpiresAt), { addSuffix: true })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
