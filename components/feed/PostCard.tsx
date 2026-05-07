"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { BetBadge } from "./BetBadge";
import { LikeButtons } from "./LikeButtons";
import { MediaGallery } from "./MediaGallery";
import { Button } from "@/components/ui/button";

interface PostAuthor {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  twitterHandle?: string | null;
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
}

interface PostChannel {
  id: string;
  name: string;
  monthlyPrice?: number;
}

interface PostCardProps {
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
  author: PostAuthor;
  channel?: PostChannel | null;
  isLocked?: boolean;
  userLike?: boolean | null;
  onDelete?: () => void;
  isOwnPost?: boolean;
}

export function PostCard({
  id,
  createdAt,
  content,
  mediaUrls,
  marketTicker,
  marketTitle,
  side,
  tokenAmount,
  likeCount,
  dislikeCount,
  commentCount,
  author,
  channel,
  isLocked = false,
  userLike = null,
  onDelete,
  isOwnPost = false,
}: PostCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const authorName = author.displayName || author.username || "Anonymous";
  const authorLink = author.username ? `/profile/${author.username}` : "#";
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok && onDelete) {
        onDelete();
      }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setIsDeleting(false);
      setShowMenu(false);
    }
  };

  return (
    <article className="p-5 rounded-2xl bg-card border border-border hover:border-border/80 transition">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href={authorLink}>
            <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden">
              {author.avatarUrl ? (
                <Image
                  src={author.avatarUrl}
                  alt={authorName}
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Link href={authorLink} className="font-semibold text-foreground hover:underline">
                {authorName}
              </Link>
              {/* Social link indicators */}
              <div className="flex items-center gap-1">
                {author.twitterHandle && (
                  <a
                    href={`https://x.com/${author.twitterHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition"
                    title={`@${author.twitterHandle}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {author.instagramHandle && (
                  <a
                    href={`https://instagram.com/${author.instagramHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition"
                    title={`@${author.instagramHandle}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </a>
                )}
                {author.tiktokHandle && (
                  <a
                    href={`https://tiktok.com/@${author.tiktokHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition"
                    title={`@${author.tiktokHandle}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
            {author.username && (
              <p className="text-xs text-muted-foreground">@{author.username}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{timeAgo}</span>
              {channel && (
                <>
                  <span>•</span>
                  <Link href={`/channel/${channel.id}`} className="hover:text-foreground transition">
                    in {channel.name}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {isOwnPost && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-muted-foreground hover:text-foreground transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 w-36 py-1 bg-card border border-border rounded-lg shadow-lg z-10">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-secondary transition"
                >
                  {isDeleting ? "Deleting..." : "Delete Post"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bet Badge */}
      <div className="mb-4">
        <BetBadge
          marketTitle={marketTitle}
          side={side}
          tokenAmount={tokenAmount}
        />
      </div>

      {/* Content */}
      {isLocked ? (
        <div className="mb-4">
          <p className="text-foreground/90 leading-relaxed mb-4">{content}</p>
          <div className="p-4 rounded-xl bg-secondary/50 border border-border text-center">
            <svg className="w-8 h-8 mx-auto mb-2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-sm font-medium text-foreground mb-1">Premium Content</p>
            <p className="text-xs text-muted-foreground mb-3">
              Subscribe to {channel?.name} to see the full post
            </p>
            {channel && (
              <Link href={`/channel/${channel.id}`}>
                <Button size="sm">
                  Subscribe · ${((channel.monthlyPrice || 0) / 100).toFixed(2)}/mo
                </Button>
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="text-foreground/90 leading-relaxed mb-4 whitespace-pre-wrap">{content}</p>
          {mediaUrls.length > 0 && (
            <div className="mb-4">
              <MediaGallery mediaUrls={mediaUrls} />
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <LikeButtons
          postId={id}
          likeCount={likeCount}
          dislikeCount={dislikeCount}
          userLike={userLike}
        />

        <div className="flex items-center gap-4">
          <Link
            href={`/post/${id}`}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm">{commentCount}</span>
          </Link>

          <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}
