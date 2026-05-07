"use client";

interface BetBadgeProps {
  marketTitle: string;
  side: string;
  tokenAmount: number;
  compact?: boolean;
}

export function BetBadge({ marketTitle, side, tokenAmount, compact = false }: BetBadgeProps) {
  const isYes = side.toUpperCase() === "YES";

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/50 text-xs">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            isYes ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
          }`}
        >
          {side}
        </span>
        <span className="text-muted-foreground">{tokenAmount.toFixed(1)} shares</span>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-gradient-to-br from-secondary/80 to-secondary/40 border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            isYes ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
          }`}
        >
          {side}
        </span>
        <span className="text-xs text-muted-foreground">
          {tokenAmount.toFixed(1)} shares
        </span>
      </div>
      <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
        {marketTitle}
      </p>
    </div>
  );
}
