"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";

interface FollowButtonProps {
  userId: string;
  isFollowing: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
  size?: "sm" | "default";
}

export function FollowButton({
  userId,
  isFollowing: initialIsFollowing,
  onFollowChange,
  size = "default",
}: FollowButtonProps) {
  const { authenticated, user } = usePrivy();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isLoading, setIsLoading] = useState(false);

  const handleFollow = async () => {
    if (!authenticated || isLoading) return;

    setIsLoading(true);

    try {
      const method = isFollowing ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${userId}/follow`, {
        method,
        headers: {
          "X-Privy-Id": user?.id || "",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
        if (onFollowChange) {
          onFollowChange(data.following);
        }
      }
    } catch (err) {
      console.error("Follow error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!authenticated) {
    return null;
  }

  return (
    <Button
      onClick={handleFollow}
      disabled={isLoading}
      variant={isFollowing ? "outline" : "default"}
      size={size}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
        </span>
      ) : isFollowing ? (
        "Following"
      ) : (
        "Follow"
      )}
    </Button>
  );
}
