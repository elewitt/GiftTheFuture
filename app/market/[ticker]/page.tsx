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

// Common player/person abbreviation lookups
const ABBREVIATION_LOOKUP: Record<string, string> = {
  // NBA Players
  "SGIL": "Shai Gilgeous-Alexander",
  "NJOK": "Nikola Jokic",
  "CCUN": "Cade Cunningham",
  "VWEM": "Victor Wembanyama",
  "JBRO": "Jaylen Brown",
  "LDON": "Luka Doncic",
  "LJAR": "LeBron James",
  "JTAT": "Jayson Tatum",
  "GANT": "Giannis Antetokounmpo",
  "SCUR": "Stephen Curry",
  "KDUR": "Kevin Durant",
  "JEMB": "Joel Embiid",
  "JMOR": "Ja Morant",
  "DBOOK": "Devin Booker",
  "TANT": "Trae Young",
  "DMIT": "Donovan Mitchell",
  "AEDW": "Anthony Edwards",
  "ADED": "Anthony Davis",
  "JHAR": "James Harden",
  "KLEO": "Kawhi Leonard",
  "PBAT": "Paolo Banchero",
  // NFL Players
  "JALL": "Josh Allen",
  "PMAH": "Patrick Mahomes",
  "LJAC": "Lamar Jackson",
  "JHER": "Justin Herbert",
  "JBUR": "Joe Burrow",
  "THUR": "Tua Tagovailoa",
  // Politicians
  "JS": "Judy Shelton",
  "KW": "Kevin Warsh",
  "KH": "Kevin Hassett",
  "RREI": "Rick Rieder",
  "CWAL": "Christopher Waller",
  "MBOW": "Michelle Bowman",
  "SBES": "Scott Bessent",
  "SMIR": "Stephen Miran",
};

/**
 * Detect if this is a head-to-head matchup (e.g., "Toronto at Washington Winner?")
 */
function isHeadToHeadMatchup(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return (lowerTitle.includes(' at ') || lowerTitle.includes(' vs ') || lowerTitle.includes(' v '))
    && (lowerTitle.includes('winner') || lowerTitle.includes('win'));
}

/**
 * Extract team names from a head-to-head matchup title
 * E.g., "Toronto at Washington Winner?" → ["Toronto", "Washington"]
 */
function extractTeamNames(title: string): [string, string] | null {
  // Try "Team1 at Team2 Winner?" pattern
  const atMatch = title.match(/^(.+?)\s+at\s+(.+?)\s+(?:Winner|Win)/i);
  if (atMatch) {
    return [atMatch[1].trim(), atMatch[2].trim()];
  }

  // Try "Team1 vs Team2 Winner?" pattern
  const vsMatch = title.match(/^(.+?)\s+(?:vs\.?|v)\s+(.+?)\s+(?:Winner|Win)/i);
  if (vsMatch) {
    return [vsMatch[1].trim(), vsMatch[2].trim()];
  }

  return null;
}

/**
 * For head-to-head matchups, determine which team this outcome represents
 */
function getTeamFromOutcome(outcome: MarketDetail, teamNames: [string, string]): string {
  const ticker = outcome.ticker.toUpperCase();
  const [team1, team2] = teamNames;

  // Check if ticker contains team abbreviation or name
  // Common pattern: ticker ends with team abbreviation like -TOR, -WAS, etc.
  const parts = outcome.ticker.split('-');
  const suffix = parts[parts.length - 1]?.toUpperCase() || "";

  // Try to match suffix to team names
  const team1Upper = team1.toUpperCase();
  const team2Upper = team2.toUpperCase();

  // Check if suffix is an abbreviation of team1
  if (team1Upper.startsWith(suffix) || suffix.startsWith(team1Upper.slice(0, 3))) {
    return team1;
  }

  // Check if suffix is an abbreviation of team2
  if (team2Upper.startsWith(suffix) || suffix.startsWith(team2Upper.slice(0, 3))) {
    return team2;
  }

  // Fallback: use ticker position or suffix directly
  return suffix || team1;
}

/**
 * Extract a meaningful label from a ticker for multi-outcome events.
 * E.g., "KXBTCMAX150-25-26MAY31-149999.99" → "By May 31, 2026"
 * E.g., "Will Shai Gilgeous-Alexander win MVP?" → "Shai Gilgeous-Alexander"
 */
function getOutcomeLabel(outcome: MarketDetail, allOutcomes: MarketDetail[]): string {
  // Check if all outcomes have the same title
  const allSameTitle = allOutcomes.every(o => o.title === allOutcomes[0]?.title);

  if (!allSameTitle) {
    // Titles are different - extract the unique part (usually a name)
    const title = outcome.title;

    // Try to extract name from common patterns
    const namePatterns = [
      /^Will\s+(?:the\s+)?(.+?)\s+win/i,  // "Will the Oklahoma City win..." or "Will Shai win..."
      /^Will\s+(?:the\s+)?(.+?)\s+be\s+/i, // "Will X be nominated?"
      /nominate\s+(?:the\s+)?(.+?)\s+as/i, // "nominate Kevin Warsh as Fed Chair"
      /^(?:The\s+)?(.+?)\s+to\s+win/i,     // "The Lakers to win championship"
      /^(?:The\s+)?(.+?)\s+wins?\s/i,      // "The Lakers wins..."
    ];

    for (const pattern of namePatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        return name.length > 30 ? name.substring(0, 27) + "..." : name;
      }
    }

    // If no pattern matches, use shortened title
    return title.length > 35 ? title.substring(0, 32) + "..." : title;
  }

  // Titles are the same - check for head-to-head matchup first
  const title = allOutcomes[0]?.title || "";
  if (isHeadToHeadMatchup(title)) {
    const teamNames = extractTeamNames(title);
    if (teamNames) {
      return getTeamFromOutcome(outcome, teamNames);
    }
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

  // Fallback: Use the last part of the ticker
  const parts = ticker.split('-');
  const suffix = parts[parts.length - 1] || "";

  // Check if we have a known abbreviation lookup
  if (suffix && ABBREVIATION_LOOKUP[suffix]) {
    return ABBREVIATION_LOOKUP[suffix];
  }

  // If suffix is just initials, show it as-is
  if (suffix && /^[A-Z]+$/.test(suffix)) {
    return suffix;
  }

  return suffix || outcome.title.substring(0, 25);
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
  const [giftAmount, setGiftAmount] = useState("10"); // Dollar amount as string for input
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

  // Calculate shares from gift amount
  const giftAmountNum = parseFloat(giftAmount) || 0;
  const shares = selectedPrice > 0 ? Math.floor(giftAmountNum / selectedPrice) : 0;
  const actualCost = (shares * selectedPrice).toFixed(2);
  const potentialPayout = shares.toFixed(2);

  // Minimum order amount for DFlow
  const MIN_ORDER_AMOUNT = 1.00;
  const isBelowMinimum = giftAmountNum < MIN_ORDER_AMOUNT;

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
      setCheckoutError(`Minimum gift amount is $${MIN_ORDER_AMOUNT.toFixed(2)}.`);
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
              {isMultiOutcome && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs font-medium tracking-[0.08em] uppercase text-amber-600 px-2 py-1 rounded bg-amber-500/10">
                    {outcomes.length} Outcomes
                  </span>
                </>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
              {market.title}
            </h1>

            {isMultiOutcome ? (
              <p className="text-muted-foreground text-sm mb-6">
                Select which outcome you think will happen
              </p>
            ) : market.subtitle ? (
              <p className="text-muted-foreground text-sm mb-6">{market.subtitle}</p>
            ) : null}

            {/* Large Price Display */}
            <div className="bg-card border border-border rounded-2xl p-6 mb-6">
              {isMultiOutcome && outcomes.length === 2 && isHeadToHeadMatchup(market.title) ? (
                // Head-to-head matchup: show both teams on one line
                (() => {
                  const teamNames = extractTeamNames(market.title);
                  const sortedOutcomes = [...outcomes].sort((a, b) => b.yesPrice - a.yesPrice);
                  const outcome1 = sortedOutcomes[0];
                  const outcome2 = sortedOutcomes[1];
                  const label1 = teamNames ? getTeamFromOutcome(outcome1, teamNames) : getOutcomeLabel(outcome1, outcomes);
                  const label2 = teamNames ? getTeamFromOutcome(outcome2, teamNames) : getOutcomeLabel(outcome2, outcomes);

                  return (
                    <>
                      <div className="flex justify-between items-end mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase mb-1">{label1}</p>
                          <p className="text-4xl font-bold text-primary">
                            {Math.round(outcome1.yesPrice * 100)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground uppercase mb-1">{label2}</p>
                          <p className="text-4xl font-bold text-muted-foreground">
                            {Math.round(outcome2.yesPrice * 100)}%
                          </p>
                        </div>
                      </div>

                      {/* Price bar */}
                      <div className="h-3 bg-secondary rounded-full overflow-hidden flex">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${outcome1.yesPrice * 100}%` }}
                        />
                        <div
                          className="h-full rounded-full bg-muted-foreground/30 transition-all"
                          style={{ width: `${outcome2.yesPrice * 100}%` }}
                        />
                      </div>
                    </>
                  );
                })()
              ) : isMultiOutcome ? (
                // Multi-outcome: show all outcomes with prices
                <>
                  <p className="text-xs text-muted-foreground uppercase mb-4">
                    Outcome Probabilities
                  </p>
                  <div className="space-y-3">
                    {outcomes
                      .sort((a, b) => b.yesPrice - a.yesPrice)
                      .slice(0, 6)
                      .map((outcome) => (
                      <div key={outcome.ticker}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-foreground">
                            {getOutcomeLabel(outcome, outcomes)}
                          </span>
                          <span className="text-sm font-bold text-primary">
                            {Math.round(outcome.yesPrice * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${outcome.yesPrice * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {outcomes.length > 6 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        +{outcomes.length - 6} more outcomes available below
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

            {/* Chat Room Link */}
            <Link
              href={`/chat/${market.eventTicker || ticker}`}
              className="block bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-4 mb-6 hover:border-primary/40 transition group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💬</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition">
                      Join the Chat Room
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Token-gated discussion for position holders
                    </p>
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-primary transition">→</span>
              </div>
            </Link>

            {/* How it works */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">How gifting works</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</span>
                  <div>
                    <p className="text-sm text-foreground font-medium">Pick your position</p>
                    <p className="text-xs text-muted-foreground">Choose YES or NO and gift amount</p>
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

              {/* Gift Amount Input */}
              <div className="mb-5">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Gift Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={giftAmount}
                    onChange={(e) => {
                      // Only allow numbers and decimal point
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      // Prevent multiple decimal points
                      const parts = val.split('.');
                      if (parts.length > 2) return;
                      // Limit to 2 decimal places
                      if (parts[1] && parts[1].length > 2) return;
                      setGiftAmount(val);
                    }}
                    placeholder="10.00"
                    className="w-full pl-10 pr-4 py-4 text-2xl font-bold text-center bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div className="flex justify-center gap-2 mt-3">
                  {[5, 10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      onClick={() => setGiftAmount(n.toString())}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        parseFloat(giftAmount) === n
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ${n}
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

              {/* Payout Summary */}
              <div className="bg-secondary/50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase mb-1">You Pay</p>
                    <p className={`text-2xl font-bold ${isBelowMinimum ? "text-amber-500" : "text-foreground"}`}>
                      ${actualCost}
                    </p>
                  </div>
                  <div className="text-2xl text-muted-foreground">→</div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase mb-1">Potential Win</p>
                    <p className="text-2xl font-bold text-accent">
                      ${potentialPayout}
                    </p>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground text-center border-t border-border pt-3">
                  <span>{shares} shares @ {Math.round(selectedPrice * 100)}¢ each</span>
                  {isMultiOutcome && selectedOutcome ? (
                    <span className="block mt-1">
                      Wins if "{getOutcomeLabel(selectedOutcome, outcomes)}" happens
                    </span>
                  ) : !isMultiOutcome ? (
                    <span className="block mt-1">
                      Wins if {side.toUpperCase()} is correct
                    </span>
                  ) : null}
                </div>

                {isBelowMinimum && (
                  <p className="text-xs text-amber-500 mt-3 text-center">
                    Minimum gift is ${MIN_ORDER_AMOUNT.toFixed(2)}
                  </p>
                )}
              </div>

              {checkoutError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                  <p className="text-xs text-destructive">{checkoutError}</p>
                </div>
              )}

              {/* Checkout button */}
              <Button
                onClick={handleCheckout}
                disabled={step === "processing" || (isMultiOutcome && !selectedOutcome) || isBelowMinimum || shares === 0}
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
                ) : isBelowMinimum ? (
                  `Minimum $${MIN_ORDER_AMOUNT.toFixed(2)}`
                ) : shares === 0 ? (
                  "Enter Gift Amount"
                ) : (
                  `🎁 Send $${actualCost} Gift`
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
