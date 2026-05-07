"use client";

import { useState, useEffect, use } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Navbar } from "@/components/Navbar";
import { ChannelHeader } from "@/components/channel";
import { Feed } from "@/components/feed";
import { Button } from "@/components/ui/button";

interface ChannelPageProps {
  params: Promise<{ channelId: string }>;
}

export default function ChannelPage({ params }: ChannelPageProps) {
  const { channelId } = use(params);
  const { user } = usePrivy();

  const [channel, setChannel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChannel() {
      try {
        const res = await fetch(`/api/channels/${channelId}`, {
          headers: user?.id ? { "X-Privy-Id": user.id } : {},
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError("Channel not found");
          } else {
            throw new Error("Failed to fetch channel");
          }
          return;
        }

        const data = await res.json();
        setChannel(data);
      } catch (err: any) {
        setError(err.message || "Failed to load channel");
      } finally {
        setLoading(false);
      }
    }

    fetchChannel();
  }, [channelId, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-20">
          <div className="max-w-2xl mx-auto px-4 text-center py-20">
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
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">{error}</h2>
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20">
        <div className="max-w-2xl mx-auto px-4">
          {/* Channel header */}
          <div className="rounded-2xl bg-card border border-border overflow-hidden mb-6">
            <ChannelHeader {...channel} />
          </div>

          {/* Channel feed */}
          {channel.isSubscribed || channel.isOwner ? (
            <Feed
              channelId={channelId}
              showComposer={channel.isOwner}
            />
          ) : (
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Subscribe to Access
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Subscribe to {channel.name} to see all posts
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
