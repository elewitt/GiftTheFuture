"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
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
  isMultiOutcome?: boolean;
  topOutcomes?: { label: string; probability: number }[];
}

const categoryFilters = [
  { id: null, label: "All", icon: "✨" },
  { id: "Sports", label: "Sports", icon: "🏆" },
  { id: "Politics", label: "Politics", icon: "🏛️" },
  { id: "Economics", label: "Economics", icon: "📈" },
  { id: "Entertainment", label: "Entertainment", icon: "🎬" },
  { id: "Tech", label: "Tech", icon: "💻" },
];

export function MarketsSection() {
  const [hotBets, setHotBets] = useState<Market[]>([]);
  const [searchResults, setSearchResults] = useState<Market[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingHotBets, setLoadingHotBets] = useState(true);
  const sliderRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch hot bets on mount
  useEffect(() => {
    fetchHotBets();
  }, []);

  async function fetchHotBets() {
    setLoadingHotBets(true);
    try {
      const res = await fetch("/api/markets?trending=true&limit=12");
      const data = await res.json();
      setHotBets(data.markets || []);
    } catch (err) {
      console.error("Failed to fetch hot bets:", err);
    } finally {
      setLoadingHotBets(false);
    }
  }

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim() && !selectedCategory) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch();
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, selectedCategory]);

  async function performSearch() {
    setIsSearching(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (selectedCategory) params.set("category", selectedCategory);
      params.set("limit", "50");

      const res = await fetch(`/api/markets?${params.toString()}`);
      const data = await res.json();
      setSearchResults(data.markets || []);
    } catch (err) {
      console.error("Search failed:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  // Slider scroll handlers
  const scrollSlider = (direction: "left" | "right") => {
    if (!sliderRef.current) return;
    const scrollAmount = 320;
    sliderRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section className="py-16">
      {/* Hot Bets Slider */}
      <div className="mb-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔥</span>
              <h2 className="text-2xl font-bold text-foreground">Hot Bets</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollSlider("left")}
                className="p-2 rounded-full border border-border bg-card hover:bg-secondary transition"
                aria-label="Scroll left"
              >
                <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => scrollSlider("right")}
                className="p-2 rounded-full border border-border bg-card hover:bg-secondary transition"
                aria-label="Scroll right"
              >
                <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Slider Container */}
        <div className="relative">
          {loadingHotBets ? (
            <div className="container mx-auto px-4">
              <div className="flex gap-4 overflow-hidden">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-[300px] h-[180px] rounded-xl bg-card border border-border animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={sliderRef}
              className="flex gap-4 overflow-x-auto scrollbar-hide px-4 pb-4 snap-x snap-mandatory"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {/* Left padding for centering on larger screens */}
              <div className="flex-shrink-0 w-[calc((100vw-1280px)/2+1rem)] max-w-[calc((100vw-1280px)/2+1rem)] min-w-4 hidden xl:block" />

              {hotBets.map((market, idx) => (
                <HotBetCard key={market.ticker} market={market} index={idx} />
              ))}

              {/* Right padding */}
              <div className="flex-shrink-0 w-4" />
            </div>
          )}
        </div>
      </div>

      {/* Search Section */}
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">Find Markets</h2>
          <p className="text-muted-foreground">Search thousands of prediction markets</p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <div className="flex items-center rounded-2xl border border-border bg-card px-5 py-4 transition-all focus-within:border-primary focus-within:glow-primary">
            <svg
              className="mr-3 h-5 w-5 text-muted-foreground flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search markets... (e.g., Super Bowl, Bitcoin, Elections, NBA)"
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-lg"
            />
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin flex-shrink-0" />
            ) : query ? (
              <button
                onClick={() => setQuery("")}
                className="p-1 hover:bg-secondary rounded-full transition flex-shrink-0"
              >
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-8">
          {categoryFilters.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id ?? "all"}
                onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-gradient-brand text-primary-foreground shadow-lg"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                <span>{cat.icon}</span>
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search Results */}
        {hasSearched ? (
          <>
            {isSearching ? (
              <div className="text-center py-16">
                <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Searching markets...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-4">🔍</p>
                <p className="text-foreground font-medium mb-2">No markets found</p>
                <p className="text-muted-foreground text-sm">
                  Try different keywords or remove filters
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    Found {searchResults.length} market{searchResults.length !== 1 ? "s" : ""}
                    {query && <span> for &quot;{query}&quot;</span>}
                    {selectedCategory && <span> in {selectedCategory}</span>}
                  </p>
                  <button
                    onClick={() => {
                      setQuery("");
                      setSelectedCategory(null);
                      setHasSearched(false);
                      setSearchResults([]);
                    }}
                    className="text-sm text-primary hover:text-primary/80"
                  >
                    Clear search
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((market, idx) => (
                    <MarketCard key={market.ticker} market={market} index={idx} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="text-center py-16 border border-dashed border-border rounded-2xl bg-card/50">
            <p className="text-4xl mb-4">🎯</p>
            <p className="text-foreground font-medium mb-2">Start searching</p>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Type a keyword or select a category to discover prediction markets
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// Compact card for the hot bets slider
function HotBetCard({ market, index }: { market: Market; index: number }) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const isMultiOutcome = market.isMultiOutcome ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="flex-shrink-0 snap-start"
    >
      <Link href={`/market/${encodeURIComponent(market.ticker)}`}>
        <div className="w-[300px] rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:glow-primary">
          {/* Rank badge */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gradient-brand flex items-center justify-center text-xs font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {market.category}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatVolume(market.volume24h || market.volume)} vol
            </span>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-3 min-h-[40px]">
            {market.title}
          </h3>

          {/* Price display */}
          {isMultiOutcome && market.topOutcomes ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Top:</span>
              <span className="text-sm font-bold text-primary">
                {market.topOutcomes[0]?.label} ({market.topOutcomes[0]?.probability}%)
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold" style={{ color: "hsl(var(--yes))" }}>
                  {yesPercent}¢
                </span>
                <span className="text-xs text-muted-foreground">Yes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">No</span>
                <span className="text-lg font-bold" style={{ color: "hsl(var(--no))" }}>
                  {100 - yesPercent}¢
                </span>
              </div>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}
