"use client";

import { useState } from "react";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";

interface SubscribeButtonProps {
  channelId: string;
  monthlyPrice: number;
  isSubscribed: boolean;
  onSubscriptionChange?: (isSubscribed: boolean) => void;
}

export function SubscribeButton({
  channelId,
  monthlyPrice,
  isSubscribed: initialIsSubscribed,
  onSubscriptionChange,
}: SubscribeButtonProps) {
  const { authenticated, user } = usePrivy();
  const { login } = useLogin();
  const [isSubscribed, setIsSubscribed] = useState(initialIsSubscribed);
  const [isLoading, setIsLoading] = useState(false);

  const priceDisplay = (monthlyPrice / 100).toFixed(2);

  const handleSubscribe = async () => {
    if (!authenticated) {
      login();
      return;
    }

    if (isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/channels/${channelId}/subscribe`, {
        method: isSubscribed ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Privy-Id": user?.id || "",
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        setIsSubscribed(data.subscribed);
        if (onSubscriptionChange) {
          onSubscriptionChange(data.subscribed);
        }
      }
    } catch (err) {
      console.error("Subscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubscribed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-primary font-medium">Subscribed</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSubscribe}
          disabled={isLoading}
        >
          {isLoading ? "..." : "Cancel"}
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={handleSubscribe} disabled={isLoading}>
      {isLoading ? (
        <span className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </span>
      ) : (
        `Subscribe · $${priceDisplay}/mo`
      )}
    </Button>
  );
}
