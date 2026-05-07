"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion } from "framer-motion";
import { PostCard } from "./PostCard";
import { PostComposer } from "./PostComposer";

interface FeedPost {
  id: string;
  createdAt: string;
  content: string;
  mediaUrls: string[];
  marketTicker: string;
  marketTitle: string;
  side: string;
  tokenAmount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  channel?: {
    id: string;
    name: string;
    monthlyPrice?: number;
  } | null;
  isLocked: boolean;
  userLike: boolean | null;
}

type FeedFilter = "all" | "following";

interface FeedProps {
  initialFilter?: FeedFilter;
  channelId?: string;
  showComposer?: boolean;
}

export function Feed({
  initialFilter = "all",
  channelId,
  showComposer = true,
}: FeedProps) {
  const { authenticated, user } = usePrivy();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [filter, setFilter] = useState<FeedFilter>(initialFilter);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(
    async (reset = false) => {
      if (isLoading && !reset) return;
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("filter", channelId ? "channel" : filter);
        params.set("limit", "20");
        if (channelId) params.set("channelId", channelId);
        if (!reset && cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/feed?${params}`, {
          headers: user?.id ? { "X-Privy-Id": user.id } : {},
        });

        if (!res.ok) throw new Error("Failed to load feed");

        const data = await res.json();

        if (reset) {
          setPosts(data.posts);
        } else {
          setPosts((prev) => [...prev, ...data.posts]);
        }
        setHasMore(data.hasMore);
        setCursor(data.nextCursor);
      } catch (err: any) {
        console.error("Load feed error:", err);
        setError(err.message || "Failed to load feed");
      } finally {
        setIsLoading(false);
      }
    },
    [filter, cursor, channelId, user?.id]
  );

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setHasMore(true);
    loadPosts(true);
  }, [filter, channelId]);

  const handlePostCreated = (newPost: FeedPost) => {
    setPosts((prev) => [newPost, ...prev]);
  };

  const handlePostDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  return (
    <div className="space-y-6">
      {/* Post composer */}
      {showComposer && authenticated && (
        <PostComposer onPostCreated={handlePostCreated} channelId={channelId} />
      )}

      {/* Filter tabs (only show if not in channel view) */}
      {!channelId && authenticated && (
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl w-fit">
          <FilterTab
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            For You
          </FilterTab>
          <FilterTab
            active={filter === "following"}
            onClick={() => setFilter("following")}
          >
            Following
          </FilterTab>
        </div>
      )}

      {/* Posts */}
      <div className="space-y-4">
        {posts.map((post, index) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <PostCard
              {...post}
              isOwnPost={user?.id && post.author.id === user.id}
              onDelete={() => handlePostDeleted(post.id)}
            />
          </motion.div>
        ))}

        {/* Loading state */}
        {isLoading && (
          <div className="py-8 text-center">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading posts...</p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive mb-2">{error}</p>
            <button
              onClick={() => loadPosts(true)}
              className="text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && posts.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No posts yet
            </h3>
            <p className="text-sm text-muted-foreground">
              {filter === "following"
                ? "Follow some traders to see their posts here!"
                : "Be the first to share your position!"}
            </p>
          </div>
        )}

        {/* Load more */}
        {hasMore && !isLoading && posts.length > 0 && (
          <button
            onClick={() => loadPosts()}
            className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition rounded-xl bg-secondary/30 hover:bg-secondary/50"
          >
            Load more posts
          </button>
        )}
      </div>
    </div>
  );
}

function FilterTab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
