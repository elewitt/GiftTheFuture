"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { WalletBalance } from "@/components/WalletBalance";

interface Position {
  mint: string;
  balance: number;
  market: {
    ticker: string;
    title: string;
    status: string;
  } | null;
  side: "YES" | "NO" | "UNKNOWN";
  currentPrice?: number;
  currentValue?: number;
}

export default function DashboardPage() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useSolanaWallets();
  
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  
  // Cash out modal state
  const [cashingOut, setCashingOut] = useState<Position | null>(null);
  const [cashOutStep, setCashOutStep] = useState<"confirm" | "processing" | "done" | "error">("confirm");
  const [cashOutResult, setCashOutResult] = useState<{ signature: string; received: number } | null>(null);

  useEffect(() => {
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    if (embedded) {
      setWalletAddress(embedded.address);
    }
  }, [wallets]);

  const fetchPositions = useCallback(async () => {
    if (!walletAddress) return;
    
    setLoadingPositions(true);
    try {
      const res = await fetch(`/api/wallet/positions?address=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        setPositions(data.positions || []);
      }
    } catch (err) {
      console.error("Error fetching positions:", err);
    } finally {
      setLoadingPositions(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      fetchPositions();
    }
  }, [walletAddress, fetchPositions]);

  async function handleCashOut(position: Position) {
    if (!walletAddress || !position.market) return;
    
    setCashOutStep("processing");
    
    try {
      // Get the redemption transaction from DFlow
      const res = await fetch("/api/gift/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcomeMint: position.mint,
          amount: Math.floor(position.balance * 1e6), // Convert to smallest unit
          userPublicKey: walletAddress,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to create redemption order");
      }

      // For demo purposes, simulate success
      // In production, you'd sign and send the transaction via Privy
      setCashOutResult({
        signature: "demo-signature-" + Date.now(),
        received: position.balance * (position.currentPrice || 0.5),
      });
      setCashOutStep("done");
      
      // Refresh positions
      setTimeout(fetchPositions, 3000);
    } catch (err: any) {
      console.error("Cash out error:", err);
      setCashOutStep("error");
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">🔐</p>
          <h1 className="text-xl font-bold mb-3">Sign in to view your dashboard</h1>
          <p className="text-sm text-slate-500 mb-6">
            See your prediction market positions and cash out anytime.
          </p>
          <button
            onClick={login}
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const totalValue = positions.reduce((sum, p) => sum + (p.currentValue || p.balance * 0.5), 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="max-w-4xl mx-auto px-5 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-lg">
            🎁
          </div>
          <span className="text-lg font-bold text-slate-100">Gift the Future</span>
        </Link>
        <button
          onClick={logout}
          className="text-xs text-slate-500 hover:text-slate-300 transition px-3 py-1.5 rounded-lg border border-slate-800"
        >
          Sign Out
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-5 pb-20">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Your Dashboard</h1>
          <p className="text-sm text-slate-500">
            Manage your prediction market positions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Wallet Section */}
          <div className="lg:col-span-1 space-y-4">
            {walletAddress && (
              <WalletBalance 
                walletAddress={walletAddress} 
                onBalanceUpdate={setUsdcBalance}
              />
            )}

            {/* Portfolio Summary */}
            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Portfolio Value</p>
              <p className="text-3xl font-bold text-slate-100">
                ${totalValue.toFixed(2)}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {positions.length} active position{positions.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Quick Links */}
            <Link
              href="/"
              className="block text-center py-3 rounded-xl border border-slate-800 text-slate-400 text-sm hover:border-slate-700 hover:text-slate-300 transition"
            >
              Browse Markets →
            </Link>
          </div>

          {/* Right: Positions */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Your Positions</h2>
              <button
                onClick={fetchPositions}
                disabled={loadingPositions}
                className="text-xs text-slate-500 hover:text-slate-300 transition"
              >
                {loadingPositions ? "Loading..." : "Refresh"}
              </button>
            </div>

            {loadingPositions && positions.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 text-center">
                <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading your positions...</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 text-center">
                <p className="text-4xl mb-4">📭</p>
                <p className="text-sm text-slate-400 mb-2">No positions yet</p>
                <p className="text-xs text-slate-600 mb-4">
                  Claim a gift or purchase a position to get started
                </p>
                <Link
                  href="/"
                  className="inline-block px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition"
                >
                  Browse Markets
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((position) => (
                  <PositionCard
                    key={position.mint}
                    position={position}
                    onCashOut={() => {
                      setCashingOut(position);
                      setCashOutStep("confirm");
                    }}
                  />
                ))}
              </div>
            )}

            {/* Demo positions for testing */}
            {positions.length === 0 && (
              <div className="mt-6 p-4 bg-slate-900/20 rounded-xl border border-dashed border-slate-800">
                <p className="text-xs text-slate-600 text-center">
                  Positions will appear here when you claim a gifted prediction market token.
                  The tokens are real SPL tokens on Solana that can be traded via DFlow.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cash Out Modal */}
      {cashingOut && (
        <CashOutModal
          position={cashingOut}
          step={cashOutStep}
          result={cashOutResult}
          onConfirm={() => handleCashOut(cashingOut)}
          onClose={() => {
            setCashingOut(null);
            setCashOutStep("confirm");
            setCashOutResult(null);
          }}
        />
      )}
    </div>
  );
}

function PositionCard({ position, onCashOut }: { position: Position; onCashOut: () => void }) {
  const currentPrice = position.currentPrice ?? 0.5;
  const currentValue = position.balance * currentPrice;
  const potentialPayout = position.balance;

  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
            {position.market?.status || "Active"}
          </p>
          <h3 className="text-sm font-semibold text-slate-200 leading-snug">
            {position.market?.title || "Unknown Market"}
          </h3>
        </div>
        <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${
          position.side === "YES" 
            ? "bg-emerald-500/10 text-emerald-400" 
            : "bg-red-500/10 text-red-400"
        }`}>
          {position.side}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-[10px] text-slate-600 uppercase">Shares</p>
          <p className="text-sm font-semibold text-slate-200">{position.balance.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-600 uppercase">Current Value</p>
          <p className="text-sm font-semibold text-slate-200">${currentValue.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-600 uppercase">If Correct</p>
          <p className="text-sm font-semibold text-amber-400">${potentialPayout.toFixed(2)}</p>
        </div>
      </div>

      {/* Price bar */}
      <div className="mb-4">
        <div className="h-1.5 bg-red-500/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
            style={{ width: `${currentPrice * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span className="text-emerald-400">{Math.round(currentPrice * 100)}¢</span>
          <span className="text-red-400">{Math.round((1 - currentPrice) * 100)}¢</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className="flex-1 py-2 rounded-lg bg-slate-800/50 text-slate-400 text-xs font-medium hover:bg-slate-800 transition"
        >
          Hold Position
        </button>
        <button
          onClick={onCashOut}
          className="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition"
        >
          Cash Out · ${currentValue.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

function CashOutModal({
  position,
  step,
  result,
  onConfirm,
  onClose,
}: {
  position: Position;
  step: "confirm" | "processing" | "done" | "error";
  result: { signature: string; received: number } | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const currentPrice = position.currentPrice ?? 0.5;
  const currentValue = position.balance * currentPrice;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-5 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full">
        {step === "confirm" && (
          <>
            <h2 className="text-lg font-bold mb-2">Cash Out Position</h2>
            <p className="text-sm text-slate-500 mb-6">
              Sell your shares at the current market price.
            </p>

            <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
              <div className="flex justify-between py-2 text-sm">
                <span className="text-slate-500">Selling</span>
                <span className="text-slate-200">{position.balance.toFixed(2)} shares</span>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-slate-500">Market Price</span>
                <span className="text-slate-200">{Math.round(currentPrice * 100)}¢</span>
              </div>
              <div className="flex justify-between py-2 text-sm border-t border-slate-700 mt-2 pt-2">
                <span className="text-slate-300 font-medium">You Receive</span>
                <span className="text-emerald-400 font-bold">${currentValue.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 transition"
              >
                Confirm
              </button>
            </div>
          </>
        )}

        {step === "processing" && (
          <div className="py-8 text-center">
            <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-400">Processing your cash out...</p>
            <p className="text-xs text-slate-600 mt-2">Executing trade via DFlow</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="text-lg font-bold mb-2">Cashed Out!</h2>
            <p className="text-2xl font-bold text-emerald-400 mb-4">
              +${result.received.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mb-6">
              USDC added to your wallet
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 transition"
            >
              Done
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="py-4 text-center">
            <p className="text-4xl mb-4">⚠️</p>
            <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-6">
              The cash out couldn&apos;t be completed. Please try again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium"
              >
                Close
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
