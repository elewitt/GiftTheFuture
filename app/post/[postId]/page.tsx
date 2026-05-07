"use client";

import { useState, useEffect, use } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { PostCard } from "@/components/feed/PostCard";
import { CommentSection } from "@/components/feed/CommentSection";
import { Button } from "@/components/ui/button";

interface PostPageProps {
  params: Promise<{ postId: string }>;
}

export default function PostPage({ params }: PostPageProps) {
  const { postId } = use(params);
  const { user } = usePrivy();
  const router = useRouter();

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/posts/${postId}`, {
          headers: user?.id ? { "X-Privy-Id": user.id } : {},
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError("Post not found");
          } else {
            throw new Error("Failed to fetch post");
          }
          return;
        }

        const data = await res.json();
        setPost(data);
      } catch (err: any) {
        setError(err.message || "Failed to load post");
      } finally {
        setLoading(false);
      }
    }

    fetchPost();
  }, [postId, user?.id]);

  const handleDelete = () => {
    router.push("/feed");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20">
        <div className="max-w-2xl mx-auto px-4">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-6"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </button>

          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Loading post...</p>
            </div>
          ) : error ? (
            <div className="py-20 text-center">
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
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {error}
              </h2>
              <Button variant="secondary" onClick={() => router.push("/feed")}>
                Go to Feed
              </Button>
            </div>
          ) : post ? (
            <div className="space-y-6">
              {/* Post */}
              <PostCard
                {...post}
                isOwnPost={user?.id && post.author.id === user.id}
                onDelete={handleDelete}
              />

              {/* Comments */}
              {!post.isLocked && (
                <div className="p-5 rounded-2xl bg-card border border-border">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    Comments ({post.commentCount})
                  </h2>
                  <CommentSection postId={postId} initialComments={post.comments} />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
