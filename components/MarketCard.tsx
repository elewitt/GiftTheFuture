"use client";

import Link from "next/link";
import { motion } from "framer-motion";

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

interface MarketCardProps {
  market: Market;
  index?: number;
  showRank?: boolean;
}

const categoryEmojis: Record<string, string> = {
  Sports: "🏆",
  Politics: "🏛️",
  Economics: "📈",
  Tech: "💻",
  Crypto: "₿",
  Entertainment: "🎬",
  Science: "🔬",
  Weather: "🌤️",
  Other: "📊",
};

export function MarketCard({ market, index = 0, showRank = false }: MarketCardProps) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = 100 - yesPercent;
  const emoji = categoryEmojis[market.category] || "📊";

  // Use the isMultiOutcome flag from the API
  const isMultiOutcome = market.isMultiOutcome ?? false;

  const formatVolume = (vol: number) => {
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
    return vol.toString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link href={`/market/${encodeURIComponent(market.ticker)}`}>
        <div className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:glow-primary h-full">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{emoji}</span>
                <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {market.category}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = `/chat/${encodeURIComponent(market.eventTicker || market.ticker)}`;
                  }}
                  className="p-1.5 rounded-lg bg-secondary/80 hover:bg-primary/20 hover:text-primary transition text-muted-foreground"
                  title="Join chat"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </button>
                <span className="text-xs text-muted-foreground">
                  {formatVolume(market.volume24h || market.volume)} vol
                </span>
              </div>
            </div>

            <h3 className="mb-4 text-sm font-semibold leading-snug text-foreground line-clamp-2">
              {market.title}
            </h3>
          </div>

          <div>
            {isMultiOutcome && market.topOutcomes ? (
              // Multi-outcome: show top 2 outcomes
              <div className="space-y-2">
                {market.topOutcomes.map((outcome, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-foreground truncate pr-2">
                          {outcome.label}
                        </span>
                        <span className="text-xs font-bold text-primary flex-shrink-0">
                          {outcome.probability}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${outcome.probability}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Binary: show Yes/No bar
              <>
                <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="rounded-full transition-all"
                    style={{ width: `${yesPercent}%`, backgroundColor: "hsl(var(--yes))" }}
                  />
                  <div
                    className="rounded-full transition-all"
                    style={{ width: `${noPercent}%`, backgroundColor: "hsl(var(--no))" }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span style={{ color: "hsl(var(--yes))" }}>Yes {yesPercent}¢</span>
                  <span style={{ color: "hsl(var(--no))" }}>No {noPercent}¢</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
