"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { MarketSearch } from "@/components/MarketSearch";

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

export default function HomePage() {
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin();
  
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Load trending markets on mount with retry
  useEffect(() => {
    fetchTrendingMarkets();
  }, []);

  async function fetchTrendingMarkets() {
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
        // Retry if no markets returned
        retryCount.current++;
        setTimeout(fetchTrendingMarkets, 1000);
        return;
      }
    } catch (err: any) {
      if (retryCount.current < 2) {
        retryCount.current++;
        setTimeout(fetchTrendingMarkets, 1000);
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Get unique categories from markets
  const categories = Array.from(new Set(markets.map((m) => m.category))).sort();

  // Filter markets by category
  const displayedMarkets = selectedCategory
    ? markets.filter((m) => m.category === selectedCategory)
    : markets;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-xl">
            🎁
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">
              Gift the Future
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {authenticated ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-sm text-slate-400 hover:text-slate-200 transition"
              >
                My Gifts
              </Link>
              <button
                onClick={logout}
                className="text-xs text-slate-500 hover:text-slate-300 transition px-3 py-1.5 rounded-lg border border-slate-800"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="text-sm font-medium text-slate-300 px-4 py-2 rounded-xl border border-slate-700 hover:border-slate-600 transition"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="text-center py-10 px-5">
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-100 leading-tight mb-4">
          Gift anyone a stake
          <br />
          in the future
        </h2>
        
        {/* Powered by Kalshi */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="text-slate-500 text-sm">Powered by</span>
          <span className="text-[#00D084] text-xl font-bold tracking-tight">Kalshi</span>
        </div>

        <p className="text-slate-500 max-w-md mx-auto text-base mb-8">
          Buy a prediction market position and send it as a gift.
          No crypto knowledge required to receive.
        </p>

        {/* Search Bar */}
        <div className="max-w-xl mx-auto">
          <MarketSearch
            placeholder="Search any Kalshi market... (e.g., Super Bowl, Bitcoin, Elections)"
            showTrending={true}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-5 pb-20">
        {/* Category Pills */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                selectedCategory === null
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              Trending
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  selectedCategory === cat
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {getCategoryEmoji(cat)} {cat}
              </button>
            ))}
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-400">
            {selectedCategory
              ? `${selectedCategory} Markets`
              : "Trending Markets"}
          </h3>
          <button
            onClick={fetchTrendingMarkets}
            disabled={loading}
            className="text-xs text-slate-600 hover:text-slate-400 transition"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* Markets Grid */}
        {loading && markets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading markets...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 px-5">
            <p className="text-red-400 text-sm mb-2">Couldn&apos;t load markets</p>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">{error}</p>
            <button
              onClick={fetchTrendingMarkets}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
            >
              Try Again
            </button>
          </div>
        ) : displayedMarkets.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-slate-400 text-sm">No markets found</p>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="mt-4 text-indigo-400 text-sm hover:text-indigo-300"
              >
                Show all markets
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedMarkets.map((market, idx) => (
              <MarketCard key={market.ticker} market={market} rank={idx + 1} showRank={!selectedCategory} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketCard({ market, rank, showRank }: { market: Market; rank: number; showRank: boolean }) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = 100 - yesPercent;

  // Format volume
  const formatVolume = (vol: number) => {
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
    return vol.toString();
  };

  return (
    <Link
      href={`/market/${encodeURIComponent(market.ticker)}`}
      className="block p-5 rounded-2xl bg-slate-900/60 border border-slate-800/50 hover:border-indigo-500/30 hover:bg-slate-900/80 transition group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {showRank && rank <= 3 && (
            <span className="text-lg">
              {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
            </span>
          )}
          <span className="text-[10px] font-medium tracking-[0.08em] uppercase text-slate-500 px-2 py-0.5 rounded bg-slate-800/50">
            {market.category}
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">
          {formatVolume(market.volume24h || market.volume)} vol
        </span>
      </div>

      <h3 className="text-[15px] font-semibold text-slate-200 leading-snug mb-4 group-hover:text-white transition line-clamp-2">
        {market.title}
      </h3>

      {/* Price bar */}
      <div className="mb-2">
        <div className="h-2 bg-red-500/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
            style={{ width: `${yesPercent}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-xs font-bold">
        <span className="text-emerald-400">Yes {yesPercent}¢</span>
        <span className="text-red-400">No {noPercent}¢</span>
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-800/30">
        <span className="text-[10px] text-slate-600 font-mono">{market.ticker}</span>
        <span className="text-[11px] text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition">
          Gift this →
        </span>
      </div>
    </Link>
  );
}

function getCategoryEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    Sports: "🏆",
    Politics: "🏛️",
    Economics: "📈",
    Tech: "💻",
    Crypto: "₿",
    Weather: "🌤️",
    Entertainment: "🎬",
    Science: "🔬",
    Other: "📊",
  };
  return emojiMap[category] || "📊";
}
