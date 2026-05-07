"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { LikeButtons } from "./LikeButtons";

interface CommentAuthor {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  createdAt: string;
  content: string;
  likeCount: number;
  dislikeCount: number;
  replyCount: number;
  author: CommentAuthor;
  userLike: boolean | null;
}

interface CommentSectionProps {
  postId: string;
  initialComments?: Comment[];
}

export function CommentSection({ postId, initialComments = [] }: CommentSectionProps) {
  const { authenticated, user } = usePrivy();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialComments.length === 0) {
      loadComments();
    }
  }, [postId]);

  const loadComments = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const url = `/api/posts/${postId}/comments${cursor ? `?cursor=${cursor}` : ""}`;
      const res = await fetch(url, {
        headers: user?.id ? { "X-Privy-Id": user.id } : {},
      });

      if (!res.ok) throw new Error("Failed to load comments");

      const data = await res.json();
      setComments((prev) => [...prev, ...data.comments]);
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch (err) {
      console.error("Load comments error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Privy-Id": user?.id || "",
        },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add comment");
      }

      const comment = await res.json();
      setComments((prev) => [comment, ...prev]);
      setNewComment("");
    } catch (err: any) {
      setError(err.message || "Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Comment form */}
      {authenticated ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="min-h-[60px]"
            maxLength={500}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!newComment.trim() || isSubmitting}
            >
              {isSubmitting ? "Posting..." : "Comment"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="p-4 rounded-xl bg-secondary/50 text-center">
          <p className="text-sm text-muted-foreground">Sign in to comment</p>
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-4">
        {comments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}

        {isLoading && (
          <div className="py-4 text-center">
            <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          </div>
        )}

        {hasMore && !isLoading && comments.length > 0 && (
          <button
            onClick={loadComments}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            Load more comments
          </button>
        )}

        {comments.length === 0 && !isLoading && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No comments yet. Be the first to comment!
          </p>
        )}
      </div>
    </div>
  );
}

function CommentCard({ comment }: { comment: Comment }) {
  const authorName =
    comment.author.displayName || comment.author.username || "Anonymous";
  const authorLink = comment.author.username
    ? `/profile/${comment.author.username}`
    : "#";
  const timeAgo = formatDistanceToNow(new Date(comment.createdAt), {
    addSuffix: true,
  });

  return (
    <div className="flex gap-3">
      <Link href={authorLink}>
        <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden flex-shrink-0">
          {comment.author.avatarUrl ? (
            <Image
              src={comment.author.avatarUrl}
              alt={authorName}
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <svg
                className="w-4 h-4"
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
      </Link>

      <div className="flex-1">
        <div className="p-3 rounded-xl bg-secondary/50">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={authorLink}
              className="text-sm font-semibold text-foreground hover:underline"
            >
              {authorName}
            </Link>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">
            {comment.content}
          </p>
        </div>

        <div className="flex items-center gap-4 mt-2 ml-2">
          <LikeButtons
            commentId={comment.id}
            likeCount={comment.likeCount}
            dislikeCount={comment.dislikeCount}
            userLike={comment.userLike}
            size="sm"
          />
          {comment.replyCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
