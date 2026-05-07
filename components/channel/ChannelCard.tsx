"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ChannelCardProps {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  monthlyPrice: number;
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
}

export function ChannelCard({
  id,
  name,
  description,
  avatarUrl,
  monthlyPrice,
  owner,
  subscriberCount,
  postCount,
  isOwner,
  isSubscribed,
}: ChannelCardProps) {
  const ownerName = owner.displayName || owner.username || "Anonymous";
  const priceDisplay = (monthlyPrice / 100).toFixed(2);

  return (
    <div className="p-5 rounded-2xl bg-card border border-border hover:border-border/80 transition">
      <div className="flex items-start gap-4">
        {/* Channel avatar */}
        <Link href={`/channel/${id}`}>
          <div className="w-16 h-16 rounded-xl bg-secondary overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={name}
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                <svg
                  className="w-8 h-8"
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
        </Link>

        {/* Channel info */}
        <div className="flex-1 min-w-0">
          <Link href={`/channel/${id}`}>
            <h3 className="font-semibold text-foreground hover:underline line-clamp-1">
              {name}
            </h3>
          </Link>
          <Link
            href={owner.username ? `/profile/${owner.username}` : "#"}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            by {ownerName}
          </Link>

          {description && (
            <p className="text-sm text-foreground/70 mt-2 line-clamp-2">
              {description}
            </p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>{subscriberCount} subscribers</span>
            <span>{postCount} posts</span>
          </div>
        </div>

        {/* Subscribe button */}
        <div className="flex-shrink-0">
          {isOwner ? (
            <Link href={`/channel/${id}`}>
              <Button variant="outline" size="sm">
                Manage
              </Button>
            </Link>
          ) : isSubscribed ? (
            <Button variant="secondary" size="sm" disabled>
              Subscribed
            </Button>
          ) : (
            <Link href={`/channel/${id}`}>
              <Button size="sm">${priceDisplay}/mo</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
