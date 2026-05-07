"use client";

import { useState, useEffect } from "react";
import { usePrivy, useLogin, useSolanaWallets } from "@privy-io/react-auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Market {
  ticker: string;
  eventTicker: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  isMultiOutcome?: boolean;
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

export function QuickBuy() {
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useSolanaWallets();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("10");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user's Solana wallet address
  const userWallet = wallets?.[0]?.address || null;

  useEffect(() => {
    fetchMarkets();
  }, []);

  async function fetchMarkets() {
    try {
      const res = await fetch("/api/markets?trending=true&limit=6");
      if (res.ok) {
        const data = await res.json();
        // Filter to binary markets only for quick buy
        setMarkets(data.markets?.filter((m: Market) => !m.isMultiOutcome) || []);
      }
    } catch (err) {
      console.error("Failed to fetch markets:", err);
    } finally {
      setLoading(false);
    }
  }

  const selectedPrice = selectedMarket
    ? side === "yes"
      ? selectedMarket.yesPrice
      : selectedMarket.noPrice
    : 0;
  const amountNum = parseFloat(amount) || 0;
  const shares = selectedPrice > 0 ? Math.floor(amountNum / selectedPrice) : 0;
  const actualCost = (shares * selectedPrice).toFixed(2);

  async function handleQuickBuy() {
    if (!authenticated) {
      login();
      return;
    }

    if (!selectedMarket) return;

    if (!userWallet) {
      setError("Wallet not found. Please try again.");
      return;
    }

    if (amountNum < 1) {
      setError("Minimum amount is $1.00");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketTicker: selectedMarket.ticker,
          marketTitle: selectedMarket.title,
          side,
          shares,
          pricePerShare: selectedPrice,
          senderEmail: user?.email?.address || "",
          senderPrivyId: user?.id || "",
          isSelfPurchase: true,
          userWalletAddress: userWallet,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Checkout creation failed");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message);
      setProcessing(false);
    }
  }

  function closeModal() {
    setSelectedMarket(null);
    setSide("yes");
    setAmount("10");
    setError(null);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-full h-28 bg-secondary/50 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (markets.length === 0) return null;

  return (
    <>
      <div className="space-y-3">
        {markets.map((market) => {
          const emoji = categoryEmojis[market.category] || "📊";
          const yesPercent = Math.round(market.yesPrice * 100);
          const noPercent = Math.round(market.noPrice * 100);

          return (
            <div
              key={market.ticker}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{emoji}</span>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">
                    {market.category}
                  </span>
                </div>
                <Link
                  href={`/chat/${encodeURIComponent(market.eventTicker || market.ticker)}`}
                  className="p-1.5 rounded-lg bg-secondary/80 hover:bg-primary/20 hover:text-primary transition text-muted-foreground"
                  title="Join chat"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </Link>
              </div>

              <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-3">
                {market.title}
              </h3>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedMarket(market);
                    setSide("yes");
                  }}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition bg-yes/10 hover:bg-yes/20 border border-yes/30"
                  style={{ color: "hsl(var(--yes))" }}
                >
                  YES {yesPercent}¢
                </button>
                <button
                  onClick={() => {
                    setSelectedMarket(market);
                    setSide("no");
                  }}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition bg-no/10 hover:bg-no/20 border border-no/30"
                  style={{ color: "hsl(var(--no))" }}
                >
                  NO {noPercent}¢
                </button>
              </div>
            </div>
          );
        })}

        <Link
          href="/#markets"
          className="block text-center text-sm text-muted-foreground hover:text-primary transition py-2"
        >
          View all markets →
        </Link>
      </div>

      {/* Quick Buy Modal */}
      {selectedMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-md">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-bold text-foreground mb-1">
              ⚡ Quick Buy
            </h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {selectedMarket.title}
            </p>

            {/* Side selector */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => setSide("yes")}
                className={`py-3 rounded-xl text-sm font-bold transition ${
                  side === "yes"
                    ? "bg-yes/15 border-2 text-yes"
                    : "bg-secondary border-2 border-transparent text-muted-foreground"
                }`}
                style={side === "yes" ? { borderColor: "hsl(var(--yes))" } : {}}
              >
                YES · {Math.round(selectedMarket.yesPrice * 100)}¢
              </button>
              <button
                onClick={() => setSide("no")}
                className={`py-3 rounded-xl text-sm font-bold transition ${
                  side === "no"
                    ? "bg-no/15 border-2 text-no"
                    : "bg-secondary border-2 border-transparent text-muted-foreground"
                }`}
                style={side === "no" ? { borderColor: "hsl(var(--no))" } : {}}
              >
                NO · {Math.round(selectedMarket.noPrice * 100)}¢
              </button>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="block text-xs text-muted-foreground uppercase mb-2">
                Amount
              </label>
              <div className="relative mb-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    const parts = val.split('.');
                    if (parts.length > 2) return;
                    if (parts[1] && parts[1].length > 2) return;
                    setAmount(val);
                  }}
                  placeholder="10.00"
                  className="w-full pl-8 pr-3 py-3 text-lg font-bold text-center bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-primary transition"
                />
              </div>
              <div className="flex gap-2">
                {[5, 10, 25, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAmount(n.toString())}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                      parseFloat(amount) === n
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ${n}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-secondary/50 rounded-xl p-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You pay</span>
                <span className="font-bold text-foreground">${actualCost}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Potential payout</span>
                <span className="font-bold text-accent">${shares.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                {shares} shares @ {Math.round(selectedPrice * 100)}¢ · Wins if {side.toUpperCase()} is correct
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 mb-4">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <Button
              onClick={handleQuickBuy}
              disabled={processing || shares === 0}
              className="w-full"
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : !authenticated ? (
                "Sign In to Buy"
              ) : shares === 0 ? (
                "Enter Amount"
              ) : (
                `Buy $${actualCost} Position`
              )}
            </Button>

            <p className="text-[10px] text-muted-foreground text-center mt-3">
              Pay with card · Position goes to your wallet
            </p>
          </div>
        </div>
      )}
    </>
  );
}
