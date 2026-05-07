"use client";

import { useState } from "react";

interface LikeButtonsProps {
  postId?: string;
  commentId?: string;
  likeCount: number;
  dislikeCount: number;
  userLike: boolean | null; // true = liked, false = disliked, null = no reaction
  onLike?: (isLike: boolean) => Promise<void>;
  size?: "sm" | "md";
}

export function LikeButtons({
  postId,
  commentId,
  likeCount,
  dislikeCount,
  userLike,
  onLike,
  size = "md",
}: LikeButtonsProps) {
  const [currentLike, setCurrentLike] = useState(userLike);
  const [currentLikeCount, setCurrentLikeCount] = useState(likeCount);
  const [currentDislikeCount, setCurrentDislikeCount] = useState(dislikeCount);
  const [isLoading, setIsLoading] = useState(false);

  const handleLike = async (isLike: boolean) => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      if (onLike) {
        await onLike(isLike);
      } else if (postId) {
        const res = await fetch(`/api/posts/${postId}/like`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isLike }),
        });

        if (res.ok) {
          const data = await res.json();
          setCurrentLike(data.liked);
          setCurrentLikeCount(data.likeCount);
          setCurrentDislikeCount(data.dislikeCount);
        }
      }
    } catch (err) {
      console.error("Like error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => handleLike(true)}
        disabled={isLoading}
        className={`flex items-center gap-1.5 transition ${
          currentLike === true
            ? "text-yes"
            : "text-muted-foreground hover:text-yes"
        } ${isLoading ? "opacity-50" : ""}`}
      >
        <svg
          className={iconSize}
          fill={currentLike === true ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
          />
        </svg>
        <span className={textSize}>{currentLikeCount}</span>
      </button>

      <button
        onClick={() => handleLike(false)}
        disabled={isLoading}
        className={`flex items-center gap-1.5 transition ${
          currentLike === false
            ? "text-no"
            : "text-muted-foreground hover:text-no"
        } ${isLoading ? "opacity-50" : ""}`}
      >
        <svg
          className={`${iconSize} rotate-180`}
          fill={currentLike === false ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
          />
        </svg>
        <span className={textSize}>{currentDislikeCount}</span>
      </button>
    </div>
  );
}
