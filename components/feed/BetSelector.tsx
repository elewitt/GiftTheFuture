"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";

interface Position {
  mint: string;
  balance: number;
  decimals: number;
  market: {
    ticker: string;
    title: string;
    status: string;
  } | null;
  side: "YES" | "NO" | "UNKNOWN";
}

interface BetSelectorProps {
  onSelect: (position: Position | null) => void;
  selectedPosition?: Position | null;
}

export function BetSelector({ onSelect, selectedPosition }: BetSelectorProps) {
  const { user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
    if (!wallet?.address) {
      setLoading(false);
      return;
    }

    async function fetchPositions() {
      try {
        // Exclude positions already posted about
        const res = await fetch(
          `/api/wallet/positions?address=${wallet.address}&excludePosted=true`,
          {
            headers: {
              "X-Privy-Id": user?.id || "",
            },
          }
        );
        if (!res.ok) throw new Error("Failed to fetch positions");
        const data = await res.json();
        // Filter to only positions with market info
        const validPositions = data.positions.filter(
          (p: Position) => p.market && p.balance > 0
        );
        setPositions(validPositions);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPositions();
  }, [wallets, user]);

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-secondary/50 border border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <span>Loading your positions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-secondary/50 border border-border">
        <p className="text-sm text-muted-foreground">
          No positions available to share. You've either shared all your positions or need to buy some first!
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/40 transition text-left"
      >
        {selectedPosition ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    selectedPosition.side === "YES"
                      ? "bg-yes/20 text-yes"
                      : "bg-no/20 text-no"
                  }`}
                >
                  {selectedPosition.side}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedPosition.balance.toFixed(1)} shares
                </span>
              </div>
              <p className="text-sm font-medium text-foreground line-clamp-1">
                {selectedPosition.market?.title}
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Select a position to share...</span>
            <svg
              className={`w-5 h-5 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-10">
          {positions.map((position) => (
            <button
              key={position.mint}
              type="button"
              onClick={() => {
                onSelect(position);
                setIsOpen(false);
              }}
              className={`w-full p-3 text-left hover:bg-secondary/50 transition first:rounded-t-xl last:rounded-b-xl ${
                selectedPosition?.mint === position.mint ? "bg-secondary/50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        position.side === "YES" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
                      }`}
                    >
                      {position.side}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {position.balance.toFixed(1)} shares
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {position.market?.title}
                  </p>
                </div>
                {selectedPosition?.mint === position.mint && (
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
