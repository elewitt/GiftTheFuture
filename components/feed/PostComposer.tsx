"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { BetSelector } from "./BetSelector";
import { MediaUploader } from "./MediaUploader";

interface Position {
  mint: string;
  balance: number;
  decimals: number;
  market: {
    ticker: string;
    title: string;
    status: string;
  } | null;
  side: "YES" | "NO" | "UNKNOWN";
}

interface PostComposerProps {
  onPostCreated?: (post: any) => void;
  channelId?: string;
}

export function PostComposer({ onPostCreated, channelId }: PostComposerProps) {
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();

  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      setError("Please write something");
      return;
    }

    if (!selectedPosition) {
      setError("Please select a position to share");
      return;
    }

    if (!wallet?.address) {
      setError("Wallet not connected");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Privy-Id": user?.id || "",
        },
        body: JSON.stringify({
          content: content.trim(),
          mediaUrls,
          marketTicker: selectedPosition.market?.ticker,
          marketTitle: selectedPosition.market?.title,
          side: selectedPosition.side,
          tokenAmount: selectedPosition.balance,
          outcomeMint: selectedPosition.mint,
          walletAddress: wallet.address,
          channelId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create post");
      }

      const newPost = await res.json();

      // Reset form
      setContent("");
      setMediaUrls([]);
      setSelectedPosition(null);
      setIsExpanded(false);

      if (onPostCreated) {
        onPostCreated(newPost);
      }
    } catch (err: any) {
      console.error("Post creation error:", err);
      setError(err.message || "Failed to create post");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="p-5 rounded-2xl bg-card border border-border text-center">
        <p className="text-muted-foreground">Sign in to share your positions</p>
      </div>
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="p-5 rounded-2xl bg-card border border-border"
      layout
    >
      <div className="mb-4">
        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (!isExpanded && e.target.value.length > 0) {
              setIsExpanded(true);
            }
          }}
          onFocus={() => setIsExpanded(true)}
          placeholder="Share your position..."
          className="min-h-[80px] resize-none"
          maxLength={1000}
        />
        <div className="flex justify-end mt-1">
          <span className="text-xs text-muted-foreground">
            {content.length}/1000
          </span>
        </div>
      </div>

      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-4"
        >
          {/* Bet selector */}
          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
              Your Position (required)
            </label>
            <BetSelector
              onSelect={setSelectedPosition}
              selectedPosition={selectedPosition}
            />
          </div>

          {/* Media uploader */}
          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
              Media (optional)
            </label>
            <MediaUploader
              mediaUrls={mediaUrls}
              onMediaChange={setMediaUrls}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                setContent("");
                setMediaUrls([]);
                setSelectedPosition(null);
                setError(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={!content.trim() || !selectedPosition || isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Posting...
                </span>
              ) : (
                "Post"
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </motion.form>
  );
}
