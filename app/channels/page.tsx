"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";

interface Channel {
  eventTicker: string;
  title: string;
  category: string;
  marketCount: number;
}

interface VerificationStatus {
  verified: boolean;
  position?: {
    side: string;
    value: number;
  };
}

export default function ChannelsPage() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();

  const walletAddress = useMemo(() => {
    const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
    return wallet?.address;
  }, [wallets]);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<Record<string, VerificationStatus>>({});
  const [verifyingChannels, setVerifyingChannels] = useState<Set<string>>(new Set());

  // Fetch channels using same API as front page
  useEffect(() => {
    async function fetchChannels() {
      setLoading(true);
      try {
        // Use same query pattern as front page MarketsSection
        const url = selectedCategory
          ? `/api/markets?category=${selectedCategory}&limit=30`
          : "/api/markets?trending=true&limit=30";

        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();

        if (data.markets) {
          // Group markets by eventTicker to create channels
          const channelMap = new Map<string, Channel>();

          for (const market of data.markets) {
            const eventTicker = market.eventTicker || market.ticker;

            if (!channelMap.has(eventTicker)) {
              channelMap.set(eventTicker, {
                eventTicker,
                title: generateChannelTitle(eventTicker, market.title),
                category: market.category || "Other",
                marketCount: 1,
              });
            } else {
              const existing = channelMap.get(eventTicker)!;
              existing.marketCount++;
            }
          }

          setChannels(Array.from(channelMap.values()));
        }
      } catch (err) {
        console.error("Failed to fetch channels:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchChannels();
  }, [selectedCategory]);

  // Generate a friendly channel title
  function generateChannelTitle(ticker: string, marketTitle: string): string {
    const t = ticker.toUpperCase();

    // Try to extract event name from market title
    const eventMatch = marketTitle?.match(
      /(?:the\s+)?(\d{4}\s+(?:Pro\s+)?(?:Basketball|Football|Baseball|Hockey|Soccer)?\s*(?:Finals?|Championship|Super Bowl|World Series|Stanley Cup|March Madness))/i
    );
    if (eventMatch) {
      return eventMatch[1];
    }

    // NBA Finals
    if (t.includes("NBA")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "";
      return `${year} NBA Finals`;
    }

    // NFL / Super Bowl
    if (t.includes("NFL") || t.includes("SB")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "";
      return `${year} Super Bowl`;
    }

    // March Madness
    if (t.includes("MARMAD") || t.includes("NCAA")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "";
      return `${year} March Madness`;
    }

    // Clean up ticker as fallback
    return ticker.replace(/-/g, " ").replace(/KX/gi, "").trim();
  }

  // Verify access to a specific channel
  const verifyChannel = useCallback(async (eventTicker: string) => {
    if (!walletAddress) return;

    setVerifyingChannels(prev => new Set(prev).add(eventTicker));

    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(eventTicker)}/verify?wallet=${walletAddress}`
      );
      const data = await res.json();

      setVerificationStatus(prev => ({
        ...prev,
        [eventTicker]: {
          verified: data.verified,
          position: data.position,
        },
      }));
    } catch (err) {
      console.error("Verification failed:", err);
      setVerificationStatus(prev => ({
        ...prev,
        [eventTicker]: { verified: false },
      }));
    } finally {
      setVerifyingChannels(prev => {
        const next = new Set(prev);
        next.delete(eventTicker);
        return next;
      });
    }
  }, [walletAddress]);

  // Filter channels based on search only (category filtering happens at API level)
  const filteredChannels = useMemo(() => {
    if (!searchQuery) return channels;

    return channels.filter(channel => {
      return channel.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        channel.eventTicker.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [channels, searchQuery]);

  // Same category tabs as front page
  const categories = [
    { id: null, label: "Trending", icon: "🔥" },
    { id: "Sports", label: "Sports", icon: "🏆" },
    { id: "Politics", label: "Politics", icon: "🏛️" },
    { id: "Economics", label: "Economics", icon: "📈" },
  ];

  // Get category emoji
  function getCategoryEmoji(category: string) {
    switch (category) {
      case "Sports": return "🏆";
      case "Politics": return "🏛️";
      case "Economics": return "📈";
      default: return "💬";
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-3">
              Prediction Channels
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Join token-gated chat rooms with other predictors. Hold any position in a market to unlock its channel.
            </p>
          </div>

          {/* Search and Filters */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search channels..."
                className="w-full pl-12 pr-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              />
            </div>

            {/* Category filters - same style as front page */}
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {categories.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id ?? "trending"}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                      isActive
                        ? "bg-gradient-brand text-primary-foreground shadow-lg"
                        : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channels Grid */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No channels found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {filteredChannels.map((channel, index) => {
                const status = verificationStatus[channel.eventTicker];
                const isVerifying = verifyingChannels.has(channel.eventTicker);

                return (
                  <motion.div
                    key={channel.eventTicker}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{getCategoryEmoji(channel.category)}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">
                          {channel.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {channel.marketCount} outcome{channel.marketCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      {!ready || !authenticated ? (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Sign in to check access
                        </p>
                      ) : status?.verified ? (
                        <Link href={`/chat/${encodeURIComponent(channel.eventTicker)}`}>
                          <Button className="w-full" size="sm">
                            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            Enter Chat
                          </Button>
                        </Link>
                      ) : status && !status.verified ? (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-2">
                            No position detected
                          </p>
                          <Link href={`/market/${encodeURIComponent(channel.eventTicker)}`}>
                            <Button variant="outline" size="sm" className="w-full">
                              Get a Position
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => verifyChannel(channel.eventTicker)}
                          disabled={isVerifying}
                        >
                          {isVerifying ? (
                            <>
                              <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin mr-2" />
                              Checking...
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                              Check Access
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {status?.verified && status.position && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Your position: <span className="text-primary font-medium">{status.position.side}</span>
                          {" "}(${status.position.value})
                        </p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
