"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

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
	
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Market[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Load trending markets on mount
  useEffect(() => {
    fetchTrendingMarkets();
  }, []);

  async function fetchTrendingMarkets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/markets?trending=true&limit=30");
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      setMarkets(data.markets);
    } catch (err: any) {async function fetchTrendingMarkets() {
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Debounced search
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/markets?q=${encodeURIComponent(query)}&limit=20`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.markets);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  // Get unique categories from markets
  const categories = Array.from(new Set(markets.map((m) => m.category))).sort();

  // Filter markets by category
  const displayedMarkets = searchResults !== null
    ? searchResults
    : selectedCategory
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
        13.178 43.408C111.354 40.048 108.762 37.456 105.402 35.632C102.042 33.76 98.106 32.824 93.594 32.824C89.418 32.824 85.674 33.664 82.362 35.344C79.098 36.976 76.506 39.328 74.586 42.4V33.688H64.362V95.368H74.874V67.384C76.794 70.504 79.386 72.904 82.65 74.584C85.914 76.312 89.562 77.176 93.594 77.176ZM91.53 68.392C88.65 68.392 86.058 67.72 83.754 66.376C81.45 64.984 79.626 63.088 78.282 60.688C76.938 58.24 76.266 55.48 76.266 52.408V52.12C76.266 49.048 76.938 46.312 78.282 43.912C79.626 41.512 81.45 39.64 83.754 38.296C86.058 36.904 88.65 36.208 91.53 36.208C94.41 36.208 97.002 36.904 99.306 38.296C101.61 39.64 103.434 41.512 104.778 43.912C106.122 46.312 106.794 49.048 106.794 52.12V52.408C106.794 55.48 106.122 58.24 104.778 60.688C103.434 63.088 101.61 64.984 99.306 66.376C97.002 67.72 94.41 68.392 91.53 68.392ZM139.334 77.176C143.75 77.176 147.59 76.312 150.854 74.584C154.166 72.856 156.71 70.456 158.486 67.384V76.312H168.71V21.688H158.198V42.4C156.374 39.328 153.806 36.976 150.494 35.344C147.23 33.664 143.558 32.824 139.478 32.824C134.918 32.824 130.934 33.76 127.526 35.632C124.166 37.456 121.55 40.048 119.678 43.408C117.854 46.72 116.942 50.584 116.942 55C116.942 59.416 117.854 63.304 119.678 66.664C121.55 69.976 124.166 72.568 127.526 74.44C130.934 76.264 134.87 77.176 139.334 77.176ZM141.398 68.392C138.518 68.392 135.926 67.72 133.622 66.376C131.318 64.984 129.494 63.088 128.15 60.688C126.806 58.24 126.134 55.48 126.134 52.408V52.12C126.134 49.048 126.806 46.312 128.15 43.912C129.494 41.512 131.318 39.64 133.622 38.296C135.926 36.904 138.518 36.208 141.398 36.208C144.278 36.208 146.87 36.904 149.174 38.296C151.478 39.64 153.302 41.512 154.646 43.912C155.99 46.312 156.662 49.048 156.662 52.12V52.408C156.662 55.48 155.99 58.24 154.646 60.688C153.302 63.088 151.478 64.984 149.174 66.376C146.87 67.72 144.278 68.392 141.398 68.392ZM186.731 76.312V21.688H176.219V76.312H186.731ZM214.077 77.176C218.973 77.176 223.317 76.192 227.109 74.224C230.901 72.208 233.877 69.472 236.037 66.016L228.597 60.976C226.965 63.28 224.877 65.08 222.333 66.376C219.789 67.624 216.957 68.248 213.837 68.248C210.957 68.248 208.341 67.672 205.989 66.52C203.685 65.32 201.837 63.616 200.445 61.408C199.149 59.248 198.453 56.752 198.357 53.92H237.549C237.645 53.152 237.693 52.288 237.693 51.328C237.693 47.392 236.757 43.816 234.885 40.6C233.061 37.384 230.469 34.84 227.109 32.968C223.749 31.048 219.789 30.088 215.229 30.088C210.621 30.088 206.517 31.12 202.917 33.184C199.317 35.2 196.485 38.008 194.421 41.608C192.405 45.16 191.397 49.24 191.397 53.848C191.397 58.408 192.429 62.464 194.493 66.016C196.557 69.52 199.413 72.28 203.061 74.296C206.757 76.216 211.077 77.176 216.021 77.176H214.077ZM214.869 38.44C219.237 38.44 222.765 39.64 225.453 42.04C228.141 44.392 229.749 47.536 230.277 51.472H198.645C199.317 47.632 201.021 44.536 203.757 42.184C206.541 39.688 210.213 38.44 214.773 38.44H214.869ZM253.063 21.688V76.312H263.575V21.688H253.063ZM282.536 33.688V76.312H293.048V33.688H282.536ZM287.792 27.016C289.712 27.016 291.296 26.416 292.544 25.216C293.84 23.968 294.488 22.48 294.488 20.752C294.488 18.976 293.84 17.488 292.544 16.288C291.296 15.088 289.712 14.488 287.792 14.488C285.872 14.488 284.264 15.088 282.968 16.288C281.72 17.488 281.096 18.976 281.096 20.752C281.096 22.48 281.72 23.968 282.968 25.216C284.264 26.416 285.872 27.016 287.792 27.016ZM336.493 77.176C341.053 77.176 344.917 76.336 348.085 74.656C351.253 72.928 353.629 70.648 355.213 67.816C356.845 64.936 357.661 61.792 357.661 58.384C357.661 54.112 356.557 50.56 354.349 47.728C352.189 44.896 348.949 42.832 344.629 41.536L332.293 37.792C330.037 37.12 328.405 36.232 327.397 35.128C326.437 34.024 325.957 32.704 325.957 31.168C325.957 29.056 326.845 27.328 328.621 25.984C330.445 24.592 332.797 23.896 335.677 23.896C338.653 23.896 341.149 24.664 343.165 26.2C345.229 27.688 346.573 29.752 347.197 32.392L357.205 29.656C356.197 25.336 353.917 21.928 350.365 19.432C346.861 16.888 342.397 15.616 336.997 15.616C332.677 15.616 328.981 16.384 325.909 17.92C322.885 19.456 320.557 21.568 318.925 24.256C317.293 26.896 316.477 29.896 316.477 33.256C316.477 37.384 317.533 40.768 319.645 43.408C321.805 46.048 324.997 48.04 329.221 49.384L341.917 53.2C344.317 53.92 346.021 54.88 347.029 56.08C348.085 57.28 348.613 58.768 348.613 60.544C348.613 62.944 347.581 64.912 345.517 66.448C343.501 67.984 340.837 68.752 337.525 68.752C333.877 68.752 330.901 67.84 328.597 66.016C326.341 64.144 324.949 61.696 324.421 58.672L314.053 61.336C314.821 66.232 317.173 70.144 321.109 73.072C325.093 75.952 330.181 77.392 336.373 77.392L336.493 77.176ZM380.557 76.312V51.184C380.557 47.248 381.565 44.2 383.581 42.04C385.645 39.832 388.501 38.728 392.149 38.728C393.061 38.728 393.877 38.776 394.597 38.872V29.656C393.973 29.56 393.181 29.512 392.221 29.512C389.101 29.512 386.341 30.28 383.941 31.816C381.589 33.304 379.813 35.368 378.613 38.008V30.352H368.389V76.312H378.901H380.557Z" fill="#00D084"/>
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="text-slate-500 text-sm">Powered by</span>
          <span className="text-[#00D084] text-xl font-bold 
         tracking-tight">Kalshi</span>
        </div>          

        

        <p className="text-slate-500 max-w-md mx-auto text-base mb-8">
          Buy a prediction market position and send it as a gift.
          No crypto knowledge required to receive.
        </p>

        {/* Search Bar */}
        <div className="max-w-xl mx-auto relative">
          <div className="relative">
            <input
              type="text"
              placeholder="Search markets... (e.g., Super Bowl, Bitcoin, Elections)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-5 py-4 pl-12 rounded-2xl bg-slate-900/80 border border-slate-800 text-slate-200 text-base placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600"
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
            {searching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
          
          {/* Search results indicator */}
          {searchQuery && searchResults !== null && (
            <p className="text-xs text-slate-500 mt-2 text-left px-2">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults(null);
                }}
                className="ml-2 text-indigo-400 hover:text-indigo-300"
              >
                Clear
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-5 pb-20">
        {/* Category Pills */}
        {!searchQuery && categories.length > 0 && (
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
            {searchQuery
              ? "Search Results"
              : selectedCategory
              ? `${selectedCategory} Markets`
              : "Trending Markets"}
          </h3>
          {!searchQuery && (
            <button
              onClick={fetchTrendingMarkets}
              disabled={loading}
              className="text-xs text-slate-600 hover:text-slate-400 transition"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          )}
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
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults(null);
                }}
                className="mt-4 text-indigo-400 text-sm hover:text-indigo-300"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedMarkets.map((market, idx) => (
              <MarketCard key={market.ticker} market={market} rank={idx + 1} showRank={!searchQuery && !selectedCategory} />
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
