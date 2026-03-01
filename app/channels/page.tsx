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
          ? `/api/markets?category=${selectedCategory}&limit=50`
          : "/api/markets?trending=true&limit=50";

        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();

        if (data.markets) {
          // Group markets by normalized channel title to avoid duplicates
          const channelMap = new Map<string, Channel>();

          for (const market of data.markets) {
            const eventTicker = market.eventTicker || market.ticker;
            const title = generateChannelTitle(eventTicker, market.title);

            // Use normalized title as key to deduplicate (e.g., all "2026 NBA Finals" together)
            const normalizedKey = title.toLowerCase().trim();

            if (!channelMap.has(normalizedKey)) {
              channelMap.set(normalizedKey, {
                eventTicker,
                title,
                category: market.category || "Other",
                marketCount: 1,
              });
            } else {
              const existing = channelMap.get(normalizedKey)!;
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

  // Generate a friendly channel title with full event context
  function generateChannelTitle(ticker: string, marketTitle: string): string {
    const t = ticker.toUpperCase();
    const title = marketTitle || "";

    // Helper to check if title has enough context (not just a name or single word)
    function hasEnoughContext(text: string): boolean {
      const words = text.trim().split(/\s+/);
      // Need at least 3 words OR contains event keywords
      const eventKeywords = ["finals", "championship", "super bowl", "world series", "march madness",
        "playoff", "election", "president", "mvp", "award", "winner", "vs", "at", "@"];
      const hasKeyword = eventKeywords.some(kw => text.toLowerCase().includes(kw));
      return words.length >= 3 || hasKeyword;
    }

    // Check for single game matchups first (e.g., "Team A vs Team B" or "Team A at Team B")
    const matchupPattern = /(.+?)\s+(?:vs\.?|at|@)\s+(.+?)(?:\s+[-–]\s+|\s*\?|$)/i;
    const matchupMatch = title.match(matchupPattern);
    if (matchupMatch) {
      const team1 = matchupMatch[1].replace(/^Will\s+/i, "").trim();
      const team2 = matchupMatch[2].replace(/\s+win.*$/i, "").trim();
      if (team1.length < 30 && team2.length < 30 && !team1.includes("Finals") && !team2.includes("Finals")) {
        return `${team1} vs ${team2}`;
      }
    }

    // Check for "Who will win" pattern with event name
    const winnerMatch = title.match(/Who will win (?:the\s+)?(.+?)(?:\?|$)/i);
    if (winnerMatch && hasEnoughContext(winnerMatch[1])) {
      return winnerMatch[1].trim();
    }

    // Extract championship/finals event name with year
    const eventMatch = title.match(
      /(?:the\s+)?(\d{4}\s+(?:Pro\s+)?(?:Basketball|Football|Baseball|Hockey|Soccer|NFL|NBA|MLB|NHL)?\s*(?:Finals?|Championship|Super Bowl|World Series|Stanley Cup|March Madness|Playoffs?))/i
    );
    if (eventMatch) {
      return eventMatch[1].trim();
    }

    // NBA Finals - extract year from ticker
    if (t.includes("NBA") && (t.includes("CHAMP") || title.toLowerCase().includes("finals"))) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "2026";
      return `${year} NBA Finals`;
    }

    // NFL / Super Bowl
    if (t.includes("NFL") || t.includes("SB") || title.toLowerCase().includes("super bowl")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "2026";
      return `${year} Super Bowl`;
    }

    // March Madness
    if (t.includes("MARMAD") || t.includes("NCAA") || title.toLowerCase().includes("march madness")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "2026";
      return `${year} March Madness`;
    }

    // Presidential/Political elections
    if (title.toLowerCase().includes("president") || title.toLowerCase().includes("election")) {
      const yearMatch = title.match(/(\d{4})/);
      const year = yearMatch ? yearMatch[1] : "";
      if (title.toLowerCase().includes("president")) {
        return `${year} Presidential Election`.trim();
      }
      return `${year} Election`.trim();
    }

    // MVP Awards
    if (title.toLowerCase().includes("mvp")) {
      const sportMatch = title.match(/(NBA|NFL|MLB|NHL)/i);
      const yearMatch = title.match(/(\d{4})/);
      const sport = sportMatch ? sportMatch[1].toUpperCase() : "";
      const year = yearMatch ? yearMatch[1] : "";
      return `${year} ${sport} MVP`.trim();
    }

    // Fed Chair / Government appointments
    if (title.toLowerCase().includes("fed chair") || title.toLowerCase().includes("federal reserve")) {
      return "Federal Reserve Chair";
    }

    // For titles that already have good context, use a cleaned version
    // Extract the core question/event from "Will X win Y?" patterns
    const willWinMatch = title.match(/Will\s+.+?\s+win\s+(?:the\s+)?(.+?)(?:\?|$)/i);
    if (willWinMatch && hasEnoughContext(willWinMatch[1])) {
      return willWinMatch[1].trim();
    }

    // If the full title has context, clean it up and use it
    if (hasEnoughContext(title)) {
      // Clean up common prefixes but keep the context
      let cleanTitle = title
        .replace(/^Will\s+/i, "")
        .replace(/\?$/, "")
        .trim();

      // Truncate if too long
      if (cleanTitle.length > 60) {
        cleanTitle = cleanTitle.substring(0, 57) + "...";
      }
      return cleanTitle;
    }

    // Final fallback: use cleaned ticker with any available context
    const tickerClean = ticker.replace(/-/g, " ").replace(/KX/gi, "").trim();
    return tickerClean || title;
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
