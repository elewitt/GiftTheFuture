"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useSolanaWallets, useCreateWallet } from "@privy-io/react-auth/solana";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface GiftData {
  id: string;
  marketTicker: string;
  marketTitle: string;
  side: string;
  tokenAmount: number;
  costUSDC: number;
  recipientName: string;
  giftMessage: string;
  status: string;
  senderPrivyId?: string;
}

type ClaimStep =
  | "loading"
  | "reveal"        // Show the gift box, waiting to be opened
  | "opening"       // Animation of opening
  | "opened"        // Show what's inside, prompt to sign in
  | "signing_in"    // User is signing in
  | "claiming"      // Transferring on-chain
  | "claimed"       // Success!
  | "already_claimed"
  | "sender_warning" // Sender is trying to claim their own gift
  | "error"
  | "not_found";

export default function GiftClaimPage() {
  const params = useParams();
  const giftId = params.id as string;

  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { createWallet } = useCreateWallet();

  const [gift, setGift] = useState<GiftData | null>(null);
  const [step, setStep] = useState<ClaimStep>("loading");
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const walletRetryCount = useRef(0);

  const { login } = useLogin({
    onComplete: async () => {
      // After login completes, useEffect will trigger claim
      // Reset retry count for new login
      walletRetryCount.current = 0;
    },
  });

  // Fetch gift details
  useEffect(() => {
    if (!giftId) return;

    fetch(`/api/gift/claim?id=${giftId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setStep("not_found");
        } else {
          setGift(data);
          if (data.status === "claimed") {
            setStep("already_claimed");
          } else {
            setStep("reveal");
          }
        }
      })
      .catch(() => setStep("not_found"));
  }, [giftId]);

  // Auto-claim when authenticated + wallet ready
  useEffect(() => {
    if (!authenticated || !gift || !ready) return;
    if (gift.status !== "pending_claim") return;
    if (step === "claiming" || step === "claimed" || step === "error" || step === "sender_warning") return;

    // Check if the current user is the sender - prevent them from claiming their own gift
    if (gift.senderPrivyId && user?.id && gift.senderPrivyId === user.id) {
      console.log("[Claim] Sender attempting to claim their own gift");
      setStep("sender_warning");
      return;
    }

    // Try multiple ways to find the Solana wallet address
    let walletAddress: string | undefined;

    // Method 1: Check useSolanaWallets hook - look for embedded wallet
    const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
    if (embeddedWallet?.address) {
      walletAddress = embeddedWallet.address;
      console.log("[Claim] Found embedded wallet:", walletAddress);
    }

    // Method 2: Check any Solana wallet from the hook
    if (!walletAddress && wallets.length > 0) {
      walletAddress = wallets[0].address;
      console.log("[Claim] Using first Solana wallet:", walletAddress);
    }

    // Method 3: Check user.linkedAccounts for Solana wallet
    if (!walletAddress && user?.linkedAccounts) {
      const solanaWallet = user.linkedAccounts.find(
        (account: any) =>
          account.type === "wallet" &&
          account.chainType === "solana" &&
          "address" in account
      );
      if (solanaWallet && "address" in solanaWallet) {
        walletAddress = (solanaWallet as any).address;
        console.log("[Claim] Found Solana wallet in linkedAccounts:", walletAddress);
      }
    }

    // Method 4: Check user.wallet (primary wallet)
    if (!walletAddress && user?.wallet?.address) {
      walletAddress = user.wallet.address;
      console.log("[Claim] Using user.wallet:", walletAddress);
    }

    if (walletAddress) {
      claimGift(walletAddress);
    } else {
      console.log("[Claim] Wallet not found, attempt:", walletRetryCount.current, {
        walletsCount: wallets.length,
        walletTypes: wallets.map(w => w.walletClientType),
        linkedAccountsCount: user?.linkedAccounts?.length,
        linkedAccountTypes: user?.linkedAccounts?.map((a: any) => `${a.type}:${a.chainType || 'unknown'}`),
        userWallet: user?.wallet,
        authenticated,
        ready,
      });

      // Try to create wallet if not found after a few retries
      if (walletRetryCount.current >= 3) {
        console.log("[Claim] Attempting to create Solana wallet...");
        createWallet()
          .then(({ wallet }) => {
            console.log("[Claim] Created wallet:", wallet.address);
            claimGift(wallet.address);
          })
          .catch((err) => {
            console.error("[Claim] Failed to create wallet:", err);
            setWalletError(err.message || "Failed to create wallet");
            setStep("error");
          });
      } else {
        walletRetryCount.current += 1;
        // Keep showing "Setting up wallet..."
        if (step !== "opened" && step !== "signing_in") {
          setStep("opened");
        }
      }
    }
  }, [authenticated, wallets, user, gift, step, ready, createWallet]);

  async function claimGift(walletAddress: string) {
    setStep("claiming");

    try {
      const res = await fetch("/api/gift/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giftId,
          recipientWalletAddress: walletAddress,
          recipientPrivyId: user?.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Claim failed");
      }

      setClaimTx(data.signature);
      setConfetti(true);
      setStep("claimed");

      // Stop confetti after a few seconds
      setTimeout(() => setConfetti(false), 5000);
    } catch (err: any) {
      console.error("Claim error:", err);
      setWalletError(err.message || "Claim failed");
      setStep("error");
    }
  }

  function handleOpenGift() {
    setStep("opening");
    // Play opening animation, then show contents
    setTimeout(() => {
      setStep("opened");
    }, 1500);
  }

  function handleSignIn() {
    setStep("signing_in");
    login();
  }

  // ─── Loading ──────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading your gift...</p>
        </div>
      </div>
    );
  }

  // ─── Not found ───────────────────────────────────────────
  if (step === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🔍</span>
          </div>
          <h1 className="text-xl font-bold mb-2 text-foreground">Gift not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This gift link may have expired or doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="text-sm text-primary hover:text-primary/80"
          >
            ← Browse markets
          </Link>
        </div>
      </div>
    );
  }

  // ─── Already claimed ─────────────────────────────────────
  if (step === "already_claimed") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">✅</span>
          </div>
          <h1 className="text-xl font-bold mb-2 text-foreground">Already claimed</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This gift has already been claimed.
          </p>
          <Link href="/dashboard">
            <Button>View Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Sender warning (trying to claim own gift) ────────────
  if (step === "sender_warning") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">👋</span>
          </div>
          <h1 className="text-xl font-bold mb-2 text-foreground">This is your gift!</h1>
          <p className="text-sm text-muted-foreground mb-2">
            You sent this gift to someone else. To test the claim flow, sign out and use a different account.
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            Share this link with your recipient so they can claim it.
          </p>
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
              }}
            >
              Copy Gift Link
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                logout();
                setStep("opened");
              }}
            >
              Sign Out & Test as Recipient
            </Button>
            <Link href="/dashboard">
              <Button variant="ghost" className="w-full">
                ← Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!gift) return null;

  // ─── Gift Reveal (unopened) ────────────────────────────────
  if (step === "reveal") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-background">
        {/* Floating particles background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-primary/30 rounded-full animate-pulse" />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-accent/40 rounded-full animate-pulse delay-300" />
          <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 bg-primary/30 rounded-full animate-pulse delay-500" />
          <div className="absolute top-1/2 right-1/4 w-1 h-1 bg-accent/30 rounded-full animate-pulse delay-700" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-md relative z-10"
        >
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-6">
            You&apos;ve received a gift
          </p>

          {/* Gift box */}
          <button
            onClick={handleOpenGift}
            className="group relative mb-8 focus:outline-none"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-brand rounded-3xl blur-2xl opacity-30 group-hover:opacity-50 transition-opacity" />

            {/* Gift box */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="relative w-40 h-40 mx-auto bg-gradient-brand rounded-3xl shadow-2xl"
            >
              {/* Ribbon horizontal */}
              <div className="absolute top-1/2 left-0 right-0 h-4 bg-accent/90 -translate-y-1/2" />
              {/* Ribbon vertical */}
              <div className="absolute top-0 bottom-0 left-1/2 w-4 bg-accent/90 -translate-x-1/2" />
              {/* Bow */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-4xl">
                🎀
              </div>
              {/* Shimmer */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 rounded-3xl" />
            </motion.div>
          </button>

          <h1 className="text-2xl font-bold text-foreground mb-3">
            {gift.recipientName ? `${gift.recipientName}, someone` : "Someone"} sent you
            <br />
            <span className="text-gradient-brand">
              a stake in the future
            </span>
          </h1>

          <p className="text-muted-foreground text-sm mb-8">
            Tap the gift to see what&apos;s inside
          </p>

          <Button onClick={handleOpenGift} size="lg">
            Open Your Gift 🎁
          </Button>
        </motion.div>
      </div>
    );
  }

  // ─── Opening animation ────────────────────────────────────
  if (step === "opening") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="text-center">
          {/* Animated gift box opening */}
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }}
            transition={{ duration: 0.5, repeat: 2 }}
            className="relative w-40 h-40 mx-auto mb-8"
          >
            <div className="absolute inset-0 bg-gradient-brand rounded-3xl animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-6xl animate-spin">✨</span>
            </div>
          </motion.div>
          <p className="text-muted-foreground animate-pulse">Opening your gift...</p>
        </div>
      </div>
    );
  }

  // ─── Opened - show contents ────────────────────────────────
  if (step === "opened" || step === "signing_in") {
    const potentialPayout = gift.tokenAmount;

    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-md w-full"
        >
          {/* Celebration emoji */}
          <div className="text-5xl mb-4 animate-bounce">🎉</div>

          <p className="text-xs font-semibold tracking-[0.15em] uppercase text-primary mb-2">
            Here&apos;s what you got
          </p>

          <h1 className="text-2xl font-bold text-foreground mb-6">
            A prediction market position
          </h1>

          {/* Position card */}
          <div className="bg-card border border-border rounded-3xl p-6 text-left mb-6 shadow-lg">
            {/* Market title */}
            <div className="mb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Market</p>
              <h2 className="text-lg font-semibold text-foreground leading-snug">
                {gift.marketTitle}
              </h2>
            </div>

            {/* Position details */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Your Bet</p>
                <p className="text-xl font-bold" style={{ color: gift.side === "yes" ? "hsl(var(--yes))" : "hsl(var(--no))" }}>
                  {gift.side.toUpperCase()}
                </p>
              </div>
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Shares</p>
                <p className="text-xl font-bold text-foreground">
                  {gift.tokenAmount}
                </p>
              </div>
            </div>

            {/* Potential payout */}
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-muted-foreground">If {gift.side.toUpperCase()} wins</p>
                  <p className="text-xs text-muted-foreground">You&apos;ll receive</p>
                </div>
                <p className="text-2xl font-bold text-accent">
                  ${potentialPayout.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Gift message */}
            {gift.giftMessage && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Message from sender</p>
                <p className="text-sm text-foreground italic bg-secondary rounded-xl p-3">
                  &quot;{gift.giftMessage}&quot;
                </p>
              </div>
            )}
          </div>

          {/* Action button */}
          {!authenticated ? (
            <div>
              <Button
                onClick={handleSignIn}
                disabled={step === "signing_in"}
                size="lg"
                className="w-full"
              >
                {step === "signing_in" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Claim Your Gift →"
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Sign in with email, Google, or phone — no crypto wallet needed
              </p>
            </div>
          ) : (
            <div className="py-4">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Setting up your wallet...</p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // ─── Claiming ─────────────────────────────────────────────
  if (step === "claiming") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="text-center max-w-sm">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative w-20 h-20 bg-gradient-brand rounded-full flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Claiming your position
          </h2>
          <p className="text-sm text-muted-foreground">
            Transferring to your wallet on Solana...
          </p>
          <div className="mt-6 flex justify-center gap-1">
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Claimed successfully ────────────────────────────────
  if (step === "claimed") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-background relative overflow-hidden">
        {/* Confetti */}
        {confetti && (
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-10%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${3 + Math.random() * 2}s`,
                }}
              >
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor: ["#059669", "#10b981", "#f59e0b", "#fbbf24", "#ef4444", "#ec4899"][
                      Math.floor(Math.random() * 6)
                    ],
                    transform: `rotate(${Math.random() * 360}deg)`,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-md w-full relative z-10"
        >
          {/* Success checkmark */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative w-24 h-24 bg-gradient-brand rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2">
            It&apos;s yours! 🎉
          </h1>
          <p className="text-muted-foreground mb-8">
            Your position has been transferred to your wallet
          </p>

          {/* Position summary card */}
          <div className="bg-card border border-border rounded-2xl p-5 text-left mb-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Market</p>
                <p className="text-sm font-medium text-foreground">{gift.marketTitle}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-secondary rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Position</p>
                <p className="text-lg font-bold" style={{ color: gift.side === "yes" ? "hsl(var(--yes))" : "hsl(var(--no))" }}>
                  {gift.side.toUpperCase()}
                </p>
              </div>
              <div className="bg-secondary rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Shares</p>
                <p className="text-lg font-bold text-foreground">{gift.tokenAmount}</p>
              </div>
              <div className="bg-secondary rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Payout</p>
                <p className="text-lg font-bold text-accent">${gift.tokenAmount.toFixed(2)}</p>
              </div>
            </div>

            {claimTx && (
              <a
                href={`https://solscan.io/tx/${claimTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 transition"
              >
                <span>View on Solscan</span>
                <span className="font-mono">{claimTx.slice(0, 6)}...{claimTx.slice(-4)}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>

          {/* What's next */}
          <div className="bg-card border border-border rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-semibold text-muted-foreground mb-3">What happens next?</p>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="text-primary mt-0.5">✓</span>
                <p className="text-sm text-foreground">
                  <strong>Hold</strong> until the market resolves — if {gift.side.toUpperCase()} wins, you get ${gift.tokenAmount.toFixed(2)}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary mt-0.5">✓</span>
                <p className="text-sm text-foreground">
                  <strong>Or cash out</strong> anytime at the current market price
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Link href="/dashboard">
              <Button variant="secondary" className="w-full">
                View Dashboard
              </Button>
            </Link>
            <Link href={`/dashboard?action=cashout&market=${gift.marketTicker}`}>
              <Button variant="success" className="w-full">
                Cash Out Now
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            Your position is on Solana and can be traded on any compatible DEX
          </p>
        </motion.div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">😕</span>
          </div>
          <h1 className="text-xl font-bold mb-2 text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4">
            We couldn&apos;t claim your gift. Please try again.
          </p>
          {walletError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-3 mb-4 font-mono">
              {walletError}
            </p>
          )}
          <Button
            onClick={() => {
              setWalletError(null);
              walletRetryCount.current = 0;
              // Try to find any wallet and claim
              const walletAddress =
                wallets.find((w) => w.walletClientType === "privy")?.address ||
                wallets[0]?.address;
              if (walletAddress) {
                claimGift(walletAddress);
              } else {
                // Try creating a wallet
                createWallet()
                  .then(({ wallet }) => claimGift(wallet.address))
                  .catch((err) => {
                    setWalletError(err.message);
                    setStep("error");
                  });
              }
            }}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
