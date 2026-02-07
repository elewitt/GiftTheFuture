"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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
  | "error"
  | "not_found";

export default function GiftClaimPage() {
  const params = useParams();
  const giftId = params.id as string;

  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();

  const [gift, setGift] = useState<GiftData | null>(null);
  const [step, setStep] = useState<ClaimStep>("loading");
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  const { login } = useLogin({
    onComplete: async () => {
      // After login completes, useEffect will trigger claim
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
    if (!authenticated || !gift) return;
    if (gift.status !== "pending_claim") return;
    if (step === "claiming" || step === "claimed" || step === "error") return;

    // Find the embedded Solana wallet from useSolanaWallets hook
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    
    // Also check user.linkedAccounts for wallet address
    const linkedWallet = user?.linkedAccounts?.find(
      (account: any) => 
        account.type === "wallet" && "address" in account
    );

    const walletAddress = embedded?.address || (linkedWallet as any)?.address;
    
    if (walletAddress) {
      console.log("[Claim] Found wallet, claiming:", walletAddress);
      claimGift(walletAddress);
    } else {
      console.log("[Claim] Waiting for wallet...", {
        walletsCount: wallets.length,
        linkedAccounts: user?.linkedAccounts?.length,
        authenticated,
      });
      // Keep showing "Setting up wallet..."
      if (step !== "opened" && step !== "signing_in") {
        setStep("opened");
      }
    }
  }, [authenticated, wallets, user, gift, step]);

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
    } catch (err) {
      console.error("Claim error:", err);
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading your gift...</p>
        </div>
      </div>
    );
  }

  // ─── Not found ───────────────────────────────────────────
  if (step === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🔍</span>
          </div>
          <h1 className="text-xl font-bold mb-2 text-slate-200">Gift not found</h1>
          <p className="text-sm text-slate-500 mb-6">
            This gift link may have expired or doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="text-sm text-indigo-400 hover:text-indigo-300"
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
      <div className="min-h-screen flex items-center justify-center px-5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">✅</span>
          </div>
          <h1 className="text-xl font-bold mb-2 text-slate-200">Already claimed</h1>
          <p className="text-sm text-slate-500 mb-6">
            This gift has already been claimed.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-3 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition"
          >
            View Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!gift) return null;

  // ─── Gift Reveal (unopened) ────────────────────────────────
  if (step === "reveal") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 bg-gradient-to-b from-slate-950 via-indigo-950/20 to-slate-950">
        {/* Floating particles background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-indigo-500/30 rounded-full animate-pulse" />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-violet-500/40 rounded-full animate-pulse delay-300" />
          <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 bg-emerald-500/30 rounded-full animate-pulse delay-500" />
          <div className="absolute top-1/2 right-1/4 w-1 h-1 bg-amber-500/30 rounded-full animate-pulse delay-700" />
        </div>

        <div className="text-center max-w-md relative z-10">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-indigo-400 mb-6 animate-fade-in">
            You&apos;ve received a gift
          </p>
          
          {/* Gift box */}
          <button
            onClick={handleOpenGift}
            className="group relative mb-8 focus:outline-none"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 rounded-3xl blur-2xl opacity-30 group-hover:opacity-50 transition-opacity" />
            
            {/* Gift box */}
            <div className="relative w-40 h-40 mx-auto bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 rounded-3xl shadow-2xl transform group-hover:scale-105 transition-all duration-300">
              {/* Ribbon horizontal */}
              <div className="absolute top-1/2 left-0 right-0 h-4 bg-amber-400/90 -translate-y-1/2" />
              {/* Ribbon vertical */}
              <div className="absolute top-0 bottom-0 left-1/2 w-4 bg-amber-400/90 -translate-x-1/2" />
              {/* Bow */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-4xl">
                🎀
              </div>
              {/* Shimmer */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 rounded-3xl" />
            </div>
          </button>

          <h1 className="text-2xl font-bold text-slate-100 mb-3">
            {gift.recipientName ? `${gift.recipientName}, someone` : "Someone"} sent you
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
              a stake in the future
            </span>
          </h1>
          
          <p className="text-slate-500 text-sm mb-8">
            Tap the gift to see what&apos;s inside
          </p>

          <button
            onClick={handleOpenGift}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold text-base hover:opacity-90 transition shadow-lg shadow-indigo-500/25"
          >
            Open Your Gift 🎁
          </button>
        </div>
      </div>
    );
  }

  // ─── Opening animation ────────────────────────────────────
  if (step === "opening") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-gradient-to-b from-slate-950 via-indigo-950/30 to-slate-950">
        <div className="text-center">
          {/* Animated gift box opening */}
          <div className="relative w-40 h-40 mx-auto mb-8 animate-bounce">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 rounded-3xl animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-6xl animate-spin">✨</span>
            </div>
          </div>
          <p className="text-slate-400 animate-pulse">Opening your gift...</p>
        </div>
      </div>
    );
  }

  // ─── Opened - show contents ────────────────────────────────
  if (step === "opened" || step === "signing_in") {
    const potentialPayout = gift.tokenAmount;
    
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center max-w-md w-full">
          {/* Celebration emoji */}
          <div className="text-5xl mb-4 animate-bounce">🎉</div>
          
          <p className="text-xs font-semibold tracking-[0.15em] uppercase text-emerald-400 mb-2">
            Here&apos;s what you got
          </p>
          
          <h1 className="text-2xl font-bold text-slate-100 mb-6">
            A prediction market position
          </h1>

          {/* Position card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 rounded-3xl p-6 text-left mb-6 shadow-xl">
            {/* Market title */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Market</p>
              <h2 className="text-lg font-semibold text-slate-100 leading-snug">
                {gift.marketTitle}
              </h2>
            </div>

            {/* Position details */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Your Bet</p>
                <p className={`text-xl font-bold ${gift.side === "yes" ? "text-emerald-400" : "text-red-400"}`}>
                  {gift.side.toUpperCase()}
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Shares</p>
                <p className="text-xl font-bold text-slate-100">
                  {gift.tokenAmount}
                </p>
              </div>
            </div>

            {/* Potential payout */}
            <div className="bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/20 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-400">If {gift.side.toUpperCase()} wins</p>
                  <p className="text-xs text-slate-500">You&apos;ll receive</p>
                </div>
                <p className="text-2xl font-bold text-amber-400">
                  ${potentialPayout.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Gift message */}
            {gift.giftMessage && (
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <p className="text-xs text-slate-500 mb-2">Message from sender</p>
                <p className="text-sm text-slate-300 italic bg-slate-800/30 rounded-xl p-3">
                  &quot;{gift.giftMessage}&quot;
                </p>
              </div>
            )}
          </div>

          {/* Action button */}
          {!authenticated ? (
            <div>
              <button
                onClick={handleSignIn}
                disabled={step === "signing_in"}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold text-base hover:opacity-90 transition disabled:opacity-50 shadow-lg shadow-indigo-500/25"
              >
                {step === "signing_in" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Claim Your Gift →"
                )}
              </button>
              <p className="text-xs text-slate-600 mt-3">
                Sign in with email, Google, or phone — no crypto wallet needed
              </p>
            </div>
          ) : (
            <div className="py-4">
              <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Setting up your wallet...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Claiming ─────────────────────────────────────────────
  if (step === "claiming") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center max-w-sm">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping" />
            <div className="relative w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">
            Claiming your position
          </h2>
          <p className="text-sm text-slate-500">
            Transferring to your wallet on Solana...
          </p>
          <div className="mt-6 flex justify-center gap-1">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Claimed successfully ────────────────────────────────
  if (step === "claimed") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-gradient-to-b from-slate-950 via-emerald-950/10 to-slate-950 relative overflow-hidden">
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
                    backgroundColor: ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"][
                      Math.floor(Math.random() * 6)
                    ],
                    transform: `rotate(${Math.random() * 360}deg)`,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="text-center max-w-md w-full relative z-10">
          {/* Success checkmark */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
            <div className="relative w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            It&apos;s yours! 🎉
          </h1>
          <p className="text-slate-400 mb-8">
            Your position has been transferred to your wallet
          </p>

          {/* Position summary card */}
          <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 text-left mb-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <p className="text-xs text-slate-500 mb-1">Market</p>
                <p className="text-sm font-medium text-slate-200">{gift.marketTitle}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Position</p>
                <p className={`text-lg font-bold ${gift.side === "yes" ? "text-emerald-400" : "text-red-400"}`}>
                  {gift.side.toUpperCase()}
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Shares</p>
                <p className="text-lg font-bold text-slate-100">{gift.tokenAmount}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Payout</p>
                <p className="text-lg font-bold text-amber-400">${gift.tokenAmount.toFixed(2)}</p>
              </div>
            </div>

            {claimTx && (
              <a
                href={`https://solscan.io/tx/${claimTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition"
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
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-semibold text-slate-400 mb-3">What happens next?</p>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <p className="text-sm text-slate-300">
                  <strong>Hold</strong> until the market resolves — if {gift.side.toUpperCase()} wins, you get ${gift.tokenAmount.toFixed(2)}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <p className="text-sm text-slate-300">
                  <strong>Or cash out</strong> anytime at the current market price
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard"
              className="py-4 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold hover:bg-slate-700 transition text-center"
            >
              View Dashboard
            </Link>
            <Link
              href={`/dashboard?action=cashout&market=${gift.marketTicker}`}
              className="py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold hover:opacity-90 transition text-center"
            >
              Cash Out Now
            </Link>
          </div>

          <p className="text-xs text-slate-600 mt-6">
            Your position is on Solana and can be traded on any compatible DEX
          </p>
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">😕</span>
          </div>
          <h1 className="text-xl font-bold mb-2 text-slate-200">Something went wrong</h1>
          <p className="text-sm text-slate-500 mb-6">
            We couldn&apos;t claim your gift. Please try again.
          </p>
          <button
            onClick={() => {
              const embedded = wallets.find((w) => w.walletClientType === "privy");
              if (embedded) {
                claimGift(embedded.address);
              }
            }}
            className="px-6 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
