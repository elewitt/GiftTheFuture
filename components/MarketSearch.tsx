"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

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

interface MarketSearchProps {
  onSelect?: (market: Market) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showTrending?: boolean;
}

export function MarketSearch({
  onSelect,
  placeholder = "Search any Kalshi market...",
  autoFocus = false,
  showTrending = true,
}: MarketSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Market[]>([]);
  const [trendingMarkets, setTrendingMarkets] = useState<Market[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("recentMarketSearches");
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved).slice(0, 5));
      } catch {}
    }
  }, []);

  // Load trending markets for suggestions
  useEffect(() => {
    if (showTrending) {
      fetch("/api/markets?trending=true&limit=6")
        .then((res) => res.json())
        .then((data) => setTrendingMarkets(data.markets || []))
        .catch(() => {});
    }
  }, [showTrending]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/markets?q=${encodeURIComponent(query)}&limit=10`);
        const data = await res.json();
        setResults(data.markets || []);
        setSelectedIndex(-1);
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = query ? results : trendingMarkets;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && items[selectedIndex]) {
            handleSelectMarket(items[selectedIndex]);
          } else if (query && results.length > 0) {
            handleSelectMarket(results[0]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [query, results, trendingMarkets, selectedIndex]
  );

  const handleSelectMarket = (market: Market) => {
    // Save to recent searches
    const newRecent = [query, ...recentSearches.filter((s) => s !== query)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem("recentMarketSearches", JSON.stringify(newRecent));

    // Navigate or callback
    if (onSelect) {
      onSelect(market);
    } else {
      router.push(`/market/${encodeURIComponent(market.ticker)}`);
    }

    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleRecentClick = (search: string) => {
    setQuery(search);
    inputRef.current?.focus();
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem("recentMarketSearches");
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayItems = query ? results : trendingMarkets;
  const showDropdown = isOpen && (displayItems.length > 0 || recentSearches.length > 0 || isLoading);

  return (
    <div className="relative w-full">
      {/* Search Input */}
      <div className="group relative flex items-center rounded-2xl border border-border bg-card/80 px-5 py-4 backdrop-blur-sm transition-all focus-within:border-primary focus-within:glow-primary">
        <svg
          className="mr-3 h-5 w-5 text-muted-foreground"
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
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {/* Loading / Clear / Kbd */}
        <div className="flex-shrink-0">
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          ) : query ? (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-1 hover:bg-secondary rounded-full transition"
            >
              <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <kbd className="hidden rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground md:inline-block">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto"
        >
          {/* Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent Searches
                </span>
                <button
                  onClick={clearRecentSearches}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search) => (
                  <button
                    key={search}
                    onClick={() => handleRecentClick(search)}
                    className="px-3 py-1.5 text-xs text-muted-foreground bg-secondary rounded-lg hover:bg-secondary/80 hover:text-foreground transition"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section Header */}
          {!query && trendingMarkets.length > 0 && (
            <div className="px-4 pt-3 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Trending Markets
              </span>
            </div>
          )}

          {query && results.length > 0 && (
            <div className="px-4 pt-3 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
              </span>
            </div>
          )}

          {/* Loading State */}
          {isLoading && query && (
            <div className="p-6 text-center">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Searching markets...</p>
            </div>
          )}

          {/* No Results */}
          {!isLoading && query && results.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-foreground text-sm mb-1">No markets found for &quot;{query}&quot;</p>
              <p className="text-muted-foreground text-xs">Try different keywords</p>
            </div>
          )}

          {/* Market Results */}
          {!isLoading && displayItems.length > 0 && (
            <div className="pb-2">
              {displayItems.map((market, index) => (
                <MarketResultItem
                  key={market.ticker}
                  market={market}
                  isSelected={index === selectedIndex}
                  onClick={() => handleSelectMarket(market)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              ))}
            </div>
          )}

          {/* Footer Hint */}
          <div className="px-4 py-2 border-t border-border bg-secondary/50">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded mr-1">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded mr-1">↓</kbd>
                to navigate
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded mr-1">↵</kbd>
                to select
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-card border border-border rounded">esc</kbd>
                to close
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketResultItem({
  market,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  market: Market;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const yesPercent = Math.round(market.yesPrice * 100);

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full px-4 py-3 flex items-center gap-4 text-left transition ${
        isSelected ? "bg-primary/10" : "hover:bg-secondary/50"
      }`}
    >
      {/* Price Badge */}
      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-secondary border border-border flex flex-col items-center justify-center">
        <span className="text-primary text-sm font-bold">{yesPercent}¢</span>
        <span className="text-[8px] text-muted-foreground uppercase">Yes</span>
      </div>

      {/* Market Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{market.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {market.category}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {formatVolume(market.volume24h || market.volume)} vol
          </span>
        </div>
      </div>

      {/* Arrow */}
      <svg
        className={`w-4 h-4 flex-shrink-0 transition ${
          isSelected ? "text-primary" : "text-border"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}
