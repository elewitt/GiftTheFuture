"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface MarketDetail {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle: string;
  category: string;
  status: string;
  yesPrice: number;
  noPrice: number;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  volume: number;
  volume24h: number;
  openInterest: number;
  closeTime: string;
  expirationTime: string;
}

export default function MarketPage() {
  const params = useParams();
  const ticker = params.ticker as string;

  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();

  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gift builder state
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [shares, setShares] = useState(10);
  const [recipientName, setRecipientName] = useState("");
  const [recipientContact, setRecipientContact] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  // Checkout state
  const [step, setStep] = useState<"build" | "processing">("build");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (ticker) fetchMarket();
  }, [ticker]);

  async function fetchMarket() {
    try {
      const res = await fetch(`/api/markets/${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Market not found");
        throw new Error("Failed to fetch market");
      }
      const data = await res.json();
      setMarket(data.market);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Use bid prices for more accurate cost calculation
  const yesPrice = market?.yesPrice ?? 0.5;
  const noPrice = market?.noPrice ?? 0.5;
  const selectedPrice = side === "yes" ? yesPrice : noPrice;
  const cost = (shares * selectedPrice).toFixed(2);
  const potentialPayout = shares.toFixed(2);

  async function handleCheckout() {
    if (!authenticated) {
      login();
      return;
    }

    if (!recipientContact) {
      setCheckoutError("Please enter recipient's email");
      return;
    }

    if (!recipientContact.includes("@")) {
      setCheckoutError("Please enter a valid email address");
      return;
    }

    setStep("processing");
    setCheckoutError(null);

    try {
      // Create Stripe checkout session
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketTicker: market?.ticker,
          marketTitle: market?.title,
          side,
          shares,
          pricePerShare: selectedPrice,
          recipientEmail: recipientContact,
          recipientName,
          giftMessage,
          senderEmail: user?.email?.address || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Checkout creation failed");
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      setCheckoutError(err.message);
      setStep("build");
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !market) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-red-400 mb-2">{error || "Market not found"}</p>
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to markets
          </Link>
        </div>
      </div>
    );
  }

  // Format volume
  const formatVolume = (vol: number) => {
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
    return `$${vol}`;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "TBD";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="max-w-5xl mx-auto px-5 py-5">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-300 transition flex items-center gap-2">
          <span>←</span> Back to markets
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-5 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Market Info */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium tracking-[0.08em] uppercase text-indigo-400 px-2 py-1 rounded bg-indigo-500/10">
                {market.category}
              </span>
              <span className="text-xs text-slate-600">•</span>
              <span className="text-xs text-slate-500 font-mono">{market.ticker}</span>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-bold text-slate-100 leading-tight mb-2">
              {market.title}
            </h1>
            
            {market.subtitle && (
              <p className="text-slate-500 text-sm mb-6">{market.subtitle}</p>
            )}

            {/* Large Price Display */}
            <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase mb-1">Yes Price</p>
                  <p className="text-4xl font-bold text-emerald-400">
                    {Math.round(yesPrice * 100)}¢
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase mb-1">No Price</p>
                  <p className="text-4xl font-bold text-red-400">
                    {Math.round(noPrice * 100)}¢
                  </p>
                </div>
              </div>
              
              {/* Price bar */}
              <div className="h-3 bg-red-500/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${yesPrice * 100}%` }}
                />
              </div>
            </div>

            {/* Market Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">24h Volume</p>
                <p className="text-lg font-semibold text-slate-200">
                  {formatVolume(market.volume24h || market.volume)}
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Total Volume</p>
                <p className="text-lg font-semibold text-slate-200">
                  {formatVolume(market.volume)}
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Open Interest</p>
                <p className="text-lg font-semibold text-slate-200">
                  {formatVolume(market.openInterest || 0)}
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Closes</p>
                <p className="text-sm font-semibold text-slate-200">
                  {formatDate(market.closeTime)}
                </p>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-slate-900/20 border border-slate-800/30 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">How gifting works</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold">1</span>
                  <div>
                    <p className="text-sm text-slate-300 font-medium">Pick your position</p>
                    <p className="text-xs text-slate-500">Choose YES or NO and how many shares</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold">2</span>
                  <div>
                    <p className="text-sm text-slate-300 font-medium">Add recipient</p>
                    <p className="text-xs text-slate-500">Enter their email and a message</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold">3</span>
                  <div>
                    <p className="text-sm text-slate-300 font-medium">They claim it</p>
                    <p className="text-xs text-slate-500">They get an email with a link to claim</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold">4</span>
                  <div>
                    <p className="text-sm text-slate-300 font-medium">Win or cash out</p>
                    <p className="text-xs text-slate-500">Hold until resolution or sell anytime</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Gift Builder */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5 sticky top-5">
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <span>🎁</span> Gift This Market
              </h2>

              {/* Side picker */}
              <div className="mb-5">
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Position
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSide("yes")}
                    className={`py-4 rounded-xl text-sm font-bold transition ${
                      side === "yes"
                        ? "bg-emerald-500/15 border-2 border-emerald-500 text-emerald-400"
                        : "bg-slate-800/50 border-2 border-transparent text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    YES · {Math.round(yesPrice * 100)}¢
                  </button>
                  <button
                    onClick={() => setSide("no")}
                    className={`py-4 rounded-xl text-sm font-bold transition ${
                      side === "no"
                        ? "bg-red-500/15 border-2 border-red-500 text-red-400"
                        : "bg-slate-800/50 border-2 border-transparent text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    NO · {Math.round(noPrice * 100)}¢
                  </button>
                </div>
              </div>

              {/* Shares picker */}
              <div className="mb-5">
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Shares
                </label>
                <div className="flex items-center justify-center gap-4 mb-3">
                  <button
                    onClick={() => setShares(Math.max(1, shares - 5))}
                    className="w-12 h-12 rounded-xl bg-slate-800 text-slate-300 text-xl font-bold hover:bg-slate-700 transition"
                  >
                    −
                  </button>
                  <span className="text-4xl font-bold text-slate-100 w-20 text-center font-mono">
                    {shares}
                  </span>
                  <button
                    onClick={() => setShares(shares + 5)}
                    className="w-12 h-12 rounded-xl bg-slate-800 text-slate-300 text-xl font-bold hover:bg-slate-700 transition"
                  >
                    +
                  </button>
                </div>
                <div className="flex justify-center gap-2">
                  {[5, 10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      onClick={() => setShares(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                        shares === n
                          ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                          : "bg-slate-800/50 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient info */}
              <div className="mb-4">
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Recipient&apos;s Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jake"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Recipient&apos;s Email *
                </label>
                <input
                  type="email"
                  placeholder="jake@email.com"
                  value={recipientContact}
                  onChange={(e) => setRecipientContact(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="mb-5">
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Gift Message
                </label>
                <textarea
                  placeholder="Good luck! 🍀"
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none"
                />
              </div>

              {/* Cost summary */}
              <div className="bg-slate-800/30 rounded-xl p-4 mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">
                    {shares} shares × {Math.round(selectedPrice * 100)}¢
                  </span>
                  <span className="text-slate-300">${cost}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Platform fee</span>
                  <span className="text-emerald-400">Free (beta)</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-700/50">
                  <span className="text-slate-300 font-semibold">Total</span>
                  <span className="text-slate-100 font-bold text-xl">${cost}</span>
                </div>
                <div className="flex justify-between text-xs mt-3 pt-2 border-t border-slate-700/30">
                  <span className="text-slate-600">If {side.toUpperCase()} wins</span>
                  <span className="text-emerald-400 font-bold">${potentialPayout} payout</span>
                </div>
              </div>

              {checkoutError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <p className="text-xs text-red-400">{checkoutError}</p>
                </div>
              )}

              {/* Checkout button */}
              <button
                onClick={handleCheckout}
                disabled={step === "processing"}
                className={`w-full py-4 rounded-xl text-white font-bold text-base transition ${
                  step === "processing"
                    ? "bg-slate-700 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-500 to-violet-500 hover:opacity-90"
                }`}
              >
                {step === "processing" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating checkout...
                  </span>
                ) : !authenticated ? (
                  "Sign In to Gift"
                ) : (
                  `🎁 Gift ${shares} Shares · $${cost}`
                )}
              </button>

              <p className="text-[10px] text-slate-600 text-center mt-3">
                Pay with card · Recipient claims via email · No wallet needed
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
