"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

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

interface MarketResponse {
  market: MarketDetail;
  isMultiOutcome: boolean;
  outcomes: MarketDetail[];
}

/**
 * Extract a meaningful label from a ticker for multi-outcome events.
 * E.g., "KXBTCMAX150-25-26MAY31-149999.99" → "By May 31, 2026"
 * E.g., "KXFEDCHAIRNOM-29-JS" → "Judy Shelton" (from title)
 */
function getOutcomeLabel(outcome: MarketDetail, allOutcomes: MarketDetail[]): string {
  // Check if all outcomes have the same title
  const allSameTitle = allOutcomes.every(o => o.title === allOutcomes[0]?.title);

  if (!allSameTitle) {
    // Titles are different - use the title
    return outcome.title;
  }

  // Titles are the same - try to extract date from ticker
  const ticker = outcome.ticker;

  // Pattern: Look for date codes like 26MAY31, 26FEB28, 26MAR31
  const dateMatch = ticker.match(/(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})/i);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const monthNames: Record<string, string> = {
      JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April',
      MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August',
      SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December'
    };
    const monthName = monthNames[month.toUpperCase()] || month;
    const fullYear = `20${year}`;
    return `By ${monthName} ${parseInt(day)}, ${fullYear}`;
  }

  // Pattern: Look for suffix like -JS, -KW (initials)
  const suffixMatch = ticker.match(/-([A-Z]{2,})$/);
  if (suffixMatch) {
    // Try to extract the name from the title
    const nameMatch = outcome.title.match(/nominate\s+(\w+\s+\w+)/i);
    if (nameMatch) {
      return nameMatch[1];
    }
  }

  // Fallback: Use the last part of the ticker
  const parts = ticker.split('-');
  return parts[parts.length - 1] || outcome.title;
}

export default function MarketPage() {
  const params = useParams();
  const ticker = params.ticker as string;

  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();

  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [isMultiOutcome, setIsMultiOutcome] = useState(false);
  const [outcomes, setOutcomes] = useState<MarketDetail[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<MarketDetail | null>(null);
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
      const data: MarketResponse = await res.json();
      setMarket(data.market);
      setIsMultiOutcome(data.isMultiOutcome);
      setOutcomes(data.outcomes || []);
      // For multi-outcome, pre-select the current market
      if (data.isMultiOutcome) {
        setSelectedOutcome(data.market);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Use bid prices for more accurate cost calculation
  // For multi-outcome, use the selected outcome's price
  const activeMarket = isMultiOutcome && selectedOutcome ? selectedOutcome : market;
  const yesPrice = activeMarket?.yesPrice ?? 0.5;
  const noPrice = activeMarket?.noPrice ?? 0.5;
  // For multi-outcome events, we're always buying YES on the selected outcome
  const selectedPrice = isMultiOutcome ? yesPrice : (side === "yes" ? yesPrice : noPrice);
  const cost = (shares * selectedPrice).toFixed(2);
  const potentialPayout = shares.toFixed(2);

  // Minimum order amount for DFlow
  const MIN_ORDER_AMOUNT = 1.0;
  const orderAmount = shares * selectedPrice;
  const isBelowMinimum = orderAmount < MIN_ORDER_AMOUNT;

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

    if (isBelowMinimum) {
      setCheckoutError(`Minimum order is $${MIN_ORDER_AMOUNT.toFixed(2)}. Please add more shares.`);
      return;
    }

    setStep("processing");
    setCheckoutError(null);

    try {
      // Create Stripe checkout session
      // For multi-outcome, use the selected outcome's ticker and always buy YES
      const checkoutMarket = isMultiOutcome && selectedOutcome ? selectedOutcome : market;
      const checkoutSide = isMultiOutcome ? "yes" : side;

      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketTicker: checkoutMarket?.ticker,
          marketTitle: checkoutMarket?.title,
          side: checkoutSide,
          shares,
          pricePerShare: selectedPrice,
          recipientEmail: recipientContact,
          recipientName,
          giftMessage,
          senderEmail: user?.email?.address || "",
          senderPrivyId: user?.id || "",
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
        <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !market) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-destructive mb-2">{error || "Market not found"}</p>
          <Link href="/" className="text-sm text-primary hover:text-primary/80">
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
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Header */}
      <div className="pt-24 max-w-5xl mx-auto px-5">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition flex items-center gap-2 mb-6">
          <span>←</span> Back to markets
        </Link>
      </div>

      <div className="max-w-5xl mx-auto px-5 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Market Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-3"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium tracking-[0.08em] uppercase text-primary px-2 py-1 rounded bg-primary/10">
                {market.category}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground font-mono">{market.ticker}</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
              {market.title}
            </h1>

            {market.subtitle && (
              <p className="text-muted-foreground text-sm mb-6">{market.subtitle}</p>
            )}

            {/* Large Price Display */}
            <div className="bg-card border border-border rounded-2xl p-6 mb-6">
              {isMultiOutcome ? (
                // Multi-outcome: show all outcomes with prices
                <>
                  <p className="text-xs text-muted-foreground uppercase mb-3">
                    {outcomes.length} Possible Outcomes
                  </p>
                  <div className="space-y-2">
                    {outcomes.slice(0, 5).map((outcome) => (
                      <div key={outcome.ticker} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${outcome.yesPrice * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-primary w-12 text-right">
                          {Math.round(outcome.yesPrice * 100)}¢
                        </span>
                        <span className="text-xs text-muted-foreground w-32 truncate">
                          {getOutcomeLabel(outcome, outcomes)}
                        </span>
                      </div>
                    ))}
                    {outcomes.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        +{outcomes.length - 5} more outcomes
                      </p>
                    )}
                  </div>
                </>
              ) : (
                // Binary: show Yes/No prices
                <>
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-1">Yes Price</p>
                      <p className="text-4xl font-bold" style={{ color: "hsl(var(--yes))" }}>
                        {Math.round(yesPrice * 100)}¢
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase mb-1">No Price</p>
                      <p className="text-4xl font-bold" style={{ color: "hsl(var(--no))" }}>
                        {Math.round(noPrice * 100)}¢
                      </p>
                    </div>
                  </div>

                  {/* Price bar */}
                  <div className="h-3 bg-secondary rounded-full overflow-hidden flex">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${yesPrice * 100}%`, backgroundColor: "hsl(var(--yes))" }}
                    />
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${noPrice * 100}%`, backgroundColor: "hsl(var(--no))" }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Market Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">24h Volume</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatVolume(market.volume24h || market.volume)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Volume</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatVolume(market.volume)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Open Interest</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatVolume(market.openInterest || 0)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Closes</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatDate(market.closeTime)}
                </p>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">How gifting works</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</span>
                  <div>
                    <p className="text-sm text-foreground font-medium">Pick your position</p>
                    <p className="text-xs text-muted-foreground">Choose YES or NO and how many shares</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</span>
                  <div>
                    <p className="text-sm text-foreground font-medium">Add recipient</p>
                    <p className="text-xs text-muted-foreground">Enter their email and a message</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</span>
                  <div>
                    <p className="text-sm text-foreground font-medium">They claim it</p>
                    <p className="text-xs text-muted-foreground">They get an email with a link to claim</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">4</span>
                  <div>
                    <p className="text-sm text-foreground font-medium">Win or cash out</p>
                    <p className="text-xs text-muted-foreground">Hold until resolution or sell anytime</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right: Gift Builder */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <div className="bg-card border border-border rounded-2xl p-5 sticky top-24">
              <h2 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                <span>🎁</span> Gift This Market
              </h2>

              {/* Outcome/Side picker */}
              <div className="mb-5">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  {isMultiOutcome ? "Select Outcome" : "Position"}
                </label>

                {isMultiOutcome ? (
                  // Multi-outcome selector
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {outcomes.map((outcome) => (
                      <button
                        key={outcome.ticker}
                        onClick={() => setSelectedOutcome(outcome)}
                        className={`w-full p-3 rounded-xl text-left transition ${
                          selectedOutcome?.ticker === outcome.ticker
                            ? "bg-primary/15 border-2 border-primary"
                            : "bg-secondary border-2 border-transparent hover:border-border"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className={`text-sm font-medium ${
                            selectedOutcome?.ticker === outcome.ticker
                              ? "text-primary"
                              : "text-foreground"
                          }`}>
                            {getOutcomeLabel(outcome, outcomes)}
                          </span>
                          <span className={`text-sm font-bold ${
                            selectedOutcome?.ticker === outcome.ticker
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}>
                            {Math.round(outcome.yesPrice * 100)}¢
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  // Binary Yes/No selector
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSide("yes")}
                      className={`py-4 rounded-xl text-sm font-bold transition ${
                        side === "yes"
                          ? "bg-yes/15 border-2 text-yes"
                          : "bg-secondary border-2 border-transparent text-muted-foreground hover:border-border"
                      }`}
                      style={side === "yes" ? { borderColor: "hsl(var(--yes))" } : {}}
                    >
                      YES · {Math.round(yesPrice * 100)}¢
                    </button>
                    <button
                      onClick={() => setSide("no")}
                      className={`py-4 rounded-xl text-sm font-bold transition ${
                        side === "no"
                          ? "bg-no/15 border-2 text-no"
                          : "bg-secondary border-2 border-transparent text-muted-foreground hover:border-border"
                      }`}
                      style={side === "no" ? { borderColor: "hsl(var(--no))" } : {}}
                    >
                      NO · {Math.round(noPrice * 100)}¢
                    </button>
                  </div>
                )}
              </div>

              {/* Shares picker */}
              <div className="mb-5">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Shares
                </label>
                <div className="flex items-center justify-center gap-4 mb-3">
                  <button
                    onClick={() => setShares(Math.max(5, shares - 5))}
                    className="w-12 h-12 rounded-xl bg-secondary text-foreground text-xl font-bold hover:bg-secondary/80 transition"
                  >
                    −
                  </button>
                  <span className="text-4xl font-bold text-foreground w-20 text-center font-mono">
                    {shares}
                  </span>
                  <button
                    onClick={() => setShares(shares + 5)}
                    className="w-12 h-12 rounded-xl bg-secondary text-foreground text-xl font-bold hover:bg-secondary/80 transition"
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
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient info */}
              <div className="mb-4">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Recipient&apos;s Name
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Jake"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Recipient&apos;s Email *
                </label>
                <Input
                  type="email"
                  placeholder="jake@email.com"
                  value={recipientContact}
                  onChange={(e) => setRecipientContact(e.target.value)}
                />
              </div>

              <div className="mb-5">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Gift Message
                </label>
                <Textarea
                  placeholder="Good luck!"
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Cost summary */}
              <div className="bg-secondary/50 rounded-xl p-4 mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    {shares} shares × {Math.round(selectedPrice * 100)}¢
                  </span>
                  <span className="text-foreground">${cost}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span className="text-primary">Free (beta)</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="text-foreground font-semibold">Total</span>
                  <span className={`font-bold text-xl ${isBelowMinimum ? "text-amber-500" : "text-foreground"}`}>${cost}</span>
                </div>
                {isBelowMinimum && (
                  <p className="text-xs text-amber-500 mt-2">
                    Minimum order is ${MIN_ORDER_AMOUNT.toFixed(2)}
                  </p>
                )}
                <div className="flex justify-between text-xs mt-3 pt-2 border-t border-border">
                  <span className="text-muted-foreground">
                    {isMultiOutcome
                      ? `If "${selectedOutcome?.title || "selected outcome"}" wins`
                      : `If ${side.toUpperCase()} wins`
                    }
                  </span>
                  <span className="text-accent font-bold">${potentialPayout} payout</span>
                </div>
              </div>

              {checkoutError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                  <p className="text-xs text-destructive">{checkoutError}</p>
                </div>
              )}

              {/* Checkout button */}
              <Button
                onClick={handleCheckout}
                disabled={step === "processing" || (isMultiOutcome && !selectedOutcome)}
                className="w-full"
                size="lg"
              >
                {step === "processing" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating checkout...
                  </span>
                ) : !authenticated ? (
                  "Sign In to Gift"
                ) : isMultiOutcome && !selectedOutcome ? (
                  "Select an Outcome"
                ) : (
                  `🎁 Gift ${shares} Shares · $${cost}`
                )}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center mt-3">
                Pay with card · Recipient claims via email · No wallet needed
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
