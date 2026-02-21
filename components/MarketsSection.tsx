"use client";

import { useState, useEffect, useRef } from "react";
import { MarketCard } from "@/components/MarketCard";

interface Market {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle: string;
  category: string;
  status: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  volume24h: number;
  closeTime: string;
}

const tabs = [
  { id: null, label: "Trending", icon: "🔥" },
  { id: "Sports", label: "Sports", icon: "🏆" },
  { id: "Politics", label: "Politics", icon: "🏛️" },
  { id: "Economics", label: "Economics", icon: "📈" },
];

export function MarketsSection() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    fetchMarkets();
  }, []);

  async function fetchMarkets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/markets?trending=true&limit=30", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      if (data.markets && data.markets.length > 0) {
        setMarkets(data.markets);
        retryCount.current = 0;
      } else if (retryCount.current < 2) {
        retryCount.current++;
        setTimeout(fetchMarkets, 1000);
        return;
      }
    } catch (err: any) {
      if (retryCount.current < 2) {
        retryCount.current++;
        setTimeout(fetchMarkets, 1000);
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const displayedMarkets = selectedCategory
    ? markets.filter((m) => m.category === selectedCategory)
    : markets;

  return (
    <section className="container mx-auto px-4 py-16">
      {/* Tabs */}
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        {tabs.map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <button
              key={tab.id ?? "trending"}
              onClick={() => setSelectedCategory(tab.id)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                isActive
                  ? "bg-gradient-brand text-primary-foreground shadow-lg"
                  : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Section header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">
          {tabs.find((t) => t.id === selectedCategory)?.label || "Trending"} Markets
        </h2>
        <button
          onClick={fetchMarkets}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          Refresh
        </button>
      </div>

      {/* Markets Grid */}
      {loading && markets.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading markets...</p>
        </div>
      ) : error ? (
        <div className="text-center py-20 px-5">
          <p className="text-destructive text-sm mb-2">Couldn&apos;t load markets</p>
          <p className="text-muted-foreground text-xs max-w-sm mx-auto mb-4">{error}</p>
          <button
            onClick={fetchMarkets}
            className="px-6 py-3 rounded-xl bg-secondary text-foreground text-sm hover:bg-secondary/80 transition"
          >
            Try Again
          </button>
        </div>
      ) : displayedMarkets.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-muted-foreground text-sm">No markets found</p>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="mt-4 text-primary text-sm hover:text-primary/80"
            >
              Show all markets
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedMarkets.map((market, idx) => (
            <MarketCard
              key={market.ticker}
              market={market}
              index={idx}
              showRank={!selectedCategory}
            />
          ))}
        </div>
      )}
    </section>
  );
}
