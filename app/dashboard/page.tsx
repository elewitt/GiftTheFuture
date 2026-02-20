"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { VersionedTransaction } from "@solana/web3.js";

interface Position {
  id: string;
  marketTicker: string;
  marketTitle: string;
  side: "yes" | "no";
  shares: number;
  costBasis: number;
  currentPrice: number;
  currentValue: number;
  potentialPayout: number;
  profitLoss: number;
  marketStatus: string;
  claimedAt: string;
  outcomeMint: string;
}

interface SentGift {
  id: string;
  marketTicker: string;
  marketTitle: string;
  side: string;
  shares: number;
  costUSDC: number;
  recipientName: string;
  recipientContact: string;
  status: string;
  currentPrice: number;
  createdAt: string;
  claimedAt: string | null;
}

interface PendingGift {
  id: string;
  marketTicker: string;
  marketTitle: string;
  side: string;
  shares: number;
  currentPrice: number;
  currentValue: number;
  potentialPayout: number;
  giftMessage: string;
  createdAt: string;
}

interface DashboardData {
  positions: Position[];
  sent: SentGift[];
  pending: PendingGift[];
  summary: {
    positionCount: number;
    totalValue: number;
    totalPotential: number;
    totalCostBasis: number;
    totalProfitLoss: number;
    sentCount: number;
    pendingCount: number;
  };
}

type Tab = "positions" | "sent" | "pending";

type CashoutStep = "confirm" | "signing" | "sending" | "confirming" | "done" | "error";

interface CashoutState {
  position: Position | null;
  step: CashoutStep;
  error: string | null;
  signature: string | null;
  usdcReceived: number | null;
}

export default function DashboardPage() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useSolanaWallets();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("positions");

  // Cashout modal state
  const [cashout, setCashout] = useState<CashoutState>({
    position: null,
    step: "confirm",
    error: null,
    signature: null,
    usdcReceived: null,
  });

  useEffect(() => {
    if (!authenticated || !user) return;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);

      try {
        const email = user?.email?.address || "";
        const res = await fetch(
          `/api/user/dashboard?privyId=${user?.id}&email=${encodeURIComponent(email)}`
        );

        if (!res.ok) throw new Error("Failed to fetch dashboard");

        const dashboardData = await res.json();
        setData(dashboardData);

        // Auto-switch to pending tab if there are pending gifts
        if (dashboardData.pending?.length > 0 && dashboardData.positions?.length === 0) {
          setActiveTab("pending");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, [authenticated, user]);

  // Cashout handler
  const handleCashout = useCallback(async () => {
    const position = cashout.position;
    if (!position) return;

    // Find the embedded Solana wallet
    const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
    if (!wallet) {
      setCashout((prev) => ({ ...prev, step: "error", error: "No wallet found" }));
      return;
    }

    try {
      // Step 1: Get the unsigned transaction from DFlow
      setCashout((prev) => ({ ...prev, step: "signing" }));

      const redeemRes = await fetch("/api/gift/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcomeMint: position.outcomeMint,
          amount: Math.floor(position.shares * 1_000_000), // Convert to raw amount
          userPublicKey: wallet.address,
        }),
      });

      if (!redeemRes.ok) {
        const errData = await redeemRes.json();
        throw new Error(errData.error || "Failed to create sell order");
      }

      const { transaction: base64Tx, outAmount } = await redeemRes.json();

      // Step 2: Deserialize and sign the transaction
      const txBuffer = Buffer.from(base64Tx, "base64");
      const transaction = VersionedTransaction.deserialize(new Uint8Array(txBuffer));

      setCashout((prev) => ({ ...prev, step: "sending" }));

      // Sign and send using Privy wallet
      const signedTx = await wallet.signTransaction(transaction);

      // Send the transaction
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const connection = new (await import("@solana/web3.js")).Connection(
        rpcUrl,
        "confirmed"
      );

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      setCashout((prev) => ({
        ...prev,
        step: "confirming",
        signature,
      }));

      // Step 3: Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      // Step 4: Update gift status in database
      const usdcReceived = Number(outAmount) / 1_000_000;

      await fetch("/api/gift/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giftId: position.id,
          signature,
          usdcReceived,
        }),
      });

      setCashout((prev) => ({
        ...prev,
        step: "done",
        usdcReceived,
      }));

      // Refresh dashboard after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      console.error("Cashout error:", err);
      setCashout((prev) => ({
        ...prev,
        step: "error",
        error: err.message || "Cashout failed",
      }));
    }
  }, [cashout.position, wallets]);

  const openCashoutModal = (position: Position) => {
    setCashout({
      position,
      step: "confirm",
      error: null,
      signature: null,
      usdcReceived: null,
    });
  };

  const closeCashoutModal = () => {
    setCashout({
      position: null,
      step: "confirm",
      error: null,
      signature: null,
      usdcReceived: null,
    });
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">📊</span>
          </div>
          <h1 className="text-2xl font-bold mb-3 text-slate-100">Your Dashboard</h1>
          <p className="text-sm text-slate-500 mb-8">
            Sign in to see your prediction market positions, track your gifts, and cash out anytime.
          </p>
          <button
            onClick={login}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold text-base hover:opacity-90 transition"
          >
            Sign In to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-800/50">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-lg">
              🎁
            </div>
            <span className="text-lg font-bold text-slate-100">Gift the Future</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 hidden sm:block">
              {user?.email?.address || "Connected"}
            </span>
            <button
              onClick={logout}
              className="text-xs text-slate-500 hover:text-slate-300 transition px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-8">
        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <SummaryCard
              label="Portfolio Value"
              value={`$${data.summary.totalValue.toFixed(2)}`}
              subtext={`${data.summary.positionCount} position${data.summary.positionCount !== 1 ? "s" : ""}`}
              color="indigo"
            />
            <SummaryCard
              label="Potential Payout"
              value={`$${data.summary.totalPotential.toFixed(2)}`}
              subtext="If all correct"
              color="amber"
            />
            <SummaryCard
              label="Total P&L"
              value={`${data.summary.totalProfitLoss >= 0 ? "+" : ""}$${data.summary.totalProfitLoss.toFixed(2)}`}
              subtext={`Cost basis: $${data.summary.totalCostBasis.toFixed(2)}`}
              color={data.summary.totalProfitLoss >= 0 ? "emerald" : "red"}
            />
            <SummaryCard
              label="Gifts Sent"
              value={data.summary.sentCount.toString()}
              subtext={data.summary.pendingCount > 0 ? `${data.summary.pendingCount} pending` : "All claimed"}
              color="violet"
            />
          </div>
        )}

        {/* Pending Gifts Alert */}
        {data && data.pending.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎁</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-200">
                  You have {data.pending.length} gift{data.pending.length > 1 ? "s" : ""} waiting!
                </p>
                <p className="text-xs text-amber-200/60">
                  Click the Pending tab to claim your positions.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("pending")}
                className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-200 text-sm font-medium hover:bg-amber-500/30 transition"
              >
                View Gifts
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-900/50 rounded-xl mb-6 w-fit">
          <TabButton
            active={activeTab === "positions"}
            onClick={() => setActiveTab("positions")}
            count={data?.positions.length}
          >
            My Positions
          </TabButton>
          <TabButton
            active={activeTab === "sent"}
            onClick={() => setActiveTab("sent")}
            count={data?.sent.length}
          >
            Sent
          </TabButton>
          <TabButton
            active={activeTab === "pending"}
            onClick={() => setActiveTab("pending")}
            count={data?.pending.length}
            highlight={(data?.pending.length ?? 0) > 0}
          >
            Pending
          </TabButton>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-500">Loading your dashboard...</p>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-red-400 mb-2">Failed to load dashboard</p>
            <p className="text-xs text-slate-600">{error}</p>
          </div>
        ) : (
          <>
            {activeTab === "positions" && <PositionsTab positions={data?.positions || []} onCashout={openCashoutModal} />}
            {activeTab === "sent" && <SentTab gifts={data?.sent || []} />}
            {activeTab === "pending" && <PendingTab gifts={data?.pending || []} />}
          </>
        )}

        {/* Quick Action */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800/50 text-slate-300 text-sm font-medium hover:bg-slate-800 transition"
          >
            <span>🔍</span>
            Browse Markets & Send a Gift
          </Link>
        </div>
      </div>

      {/* Cashout Modal */}
      {cashout.position && (
        <CashoutModal
          cashout={cashout}
          onConfirm={handleCashout}
          onClose={closeCashoutModal}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext: string;
  color: "indigo" | "amber" | "emerald" | "red" | "violet";
}) {
  const colorClasses = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/20",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
    red: "from-red-500/10 to-red-500/5 border-red-500/20",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/20",
  };

  const textColors = {
    indigo: "text-indigo-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    red: "text-red-400",
    violet: "text-violet-400",
  };

  return (
    <div className={`p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]} border`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${textColors[color]}`}>{value}</p>
      <p className="text-[10px] text-slate-600 mt-1">{subtext}</p>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
  count,
  highlight,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
        active
          ? "bg-slate-800 text-white"
          : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            highlight
              ? "bg-amber-500/20 text-amber-400"
              : active
              ? "bg-slate-700 text-slate-300"
              : "bg-slate-800/50 text-slate-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function PositionsTab({ positions, onCashout }: { positions: Position[]; onCashout: (position: Position) => void }) {
  if (positions.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📭</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">No positions yet</h3>
        <p className="text-sm text-slate-600 max-w-sm mx-auto mb-6">
          When someone sends you a prediction market gift and you claim it, your position will appear here.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition"
        >
          Browse Markets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {positions.map((position) => (
        <PositionCard key={position.id} position={position} onCashout={onCashout} />
      ))}
    </div>
  );
}

function PositionCard({ position, onCashout }: { position: Position; onCashout: (position: Position) => void }) {
  const pricePercent = Math.round(position.currentPrice * 100);
  const isProfit = position.profitLoss >= 0;

  return (
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/50 hover:border-slate-700/50 transition">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                position.side === "yes"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {position.side}
            </span>
            <span className="text-[10px] text-slate-600">
              {position.marketStatus === "open" ? "🟢 Active" : "⚪ " + position.marketStatus}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-200 leading-snug">
            {position.marketTitle}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-100">${position.currentValue.toFixed(2)}</p>
          <p className={`text-xs font-medium ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
            {isProfit ? "+" : ""}${position.profitLoss.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Price Bar */}
      <div className="mb-4">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
            style={{ width: `${pricePercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span className="text-emerald-400">Yes {pricePercent}¢</span>
          <span className="text-red-400">No {100 - pricePercent}¢</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Shares" value={position.shares.toFixed(2)} />
        <Stat label="Avg Cost" value={`$${(position.costBasis / position.shares).toFixed(2)}`} />
        <Stat label="Current" value={`${pricePercent}¢`} />
        <Stat label="If Correct" value={`$${position.potentialPayout.toFixed(2)}`} highlight />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-800/50">
        <button className="flex-1 py-2.5 rounded-xl bg-slate-800/50 text-slate-400 text-xs font-medium hover:bg-slate-800 transition">
          Hold Position
        </button>
        <button
          onClick={() => onCashout(position)}
          className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition"
        >
          Cash Out · ${position.currentValue.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 uppercase">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-amber-400" : "text-slate-200"}`}>
        {value}
      </p>
    </div>
  );
}

function SentTab({ gifts }: { gifts: SentGift[] }) {
  if (gifts.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🎁</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">No gifts sent yet</h3>
        <p className="text-sm text-slate-600 max-w-sm mx-auto mb-6">
          Send someone a prediction market position as a gift. They'll receive an email with a link to claim it.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition"
        >
          Send a Gift
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gifts.map((gift) => (
        <SentGiftCard key={gift.id} gift={gift} />
      ))}
    </div>
  );
}

function SentGiftCard({ gift }: { gift: SentGift }) {
  const statusColors: Record<string, string> = {
    pending_claim: "bg-amber-500/10 text-amber-400",
    claimed: "bg-emerald-500/10 text-emerald-400",
    cashed_out: "bg-blue-500/10 text-blue-400",
    settled: "bg-slate-500/10 text-slate-400",
  };

  const statusLabels: Record<string, string> = {
    pending_claim: "Pending",
    claimed: "Claimed",
    cashed_out: "Cashed Out",
    settled: "Settled",
  };

  return (
    <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[gift.status] || "bg-slate-500/10 text-slate-400"}`}>
              {statusLabels[gift.status] || gift.status}
            </span>
            <span className="text-[10px] text-slate-600">
              {new Date(gift.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-300 mb-1">{gift.marketTitle}</p>
          <p className="text-xs text-slate-500">
            To: {gift.recipientName || gift.recipientContact}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-200">${gift.costUSDC.toFixed(2)}</p>
          <p className="text-[10px] text-slate-500">{gift.shares.toFixed(1)} shares</p>
        </div>
      </div>
    </div>
  );
}

function PendingTab({ gifts }: { gifts: PendingGift[] }) {
  if (gifts.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">All caught up!</h3>
        <p className="text-sm text-slate-600 max-w-sm mx-auto">
          You don't have any pending gifts to claim.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {gifts.map((gift) => (
        <PendingGiftCard key={gift.id} gift={gift} />
      ))}
    </div>
  );
}

function PendingGiftCard({ gift }: { gift: PendingGift }) {
  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎁</span>
            <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">
              New Gift!
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-200">{gift.marketTitle}</h3>
          {gift.giftMessage && (
            <p className="text-xs text-slate-500 mt-1 italic">"{gift.giftMessage}"</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-amber-400">${gift.potentialPayout.toFixed(2)}</p>
          <p className="text-[10px] text-slate-500">if {gift.side.toUpperCase()} wins</p>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 mb-4">
        <div>
          <p className="text-[10px] text-slate-500">Position</p>
          <p className="text-sm font-semibold text-slate-200">
            {gift.shares.toFixed(1)} x{" "}
            <span className={gift.side === "yes" ? "text-emerald-400" : "text-red-400"}>
              {gift.side.toUpperCase()}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500">Current Value</p>
          <p className="text-sm font-semibold text-slate-200">${gift.currentValue.toFixed(2)}</p>
        </div>
      </div>

      <Link
        href={`/gift/${gift.id}`}
        className="block w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold text-center hover:opacity-90 transition"
      >
        Claim This Gift →
      </Link>
    </div>
  );
}

function CashoutModal({
  cashout,
  onConfirm,
  onClose,
}: {
  cashout: CashoutState;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const position = cashout.position!;
  const pricePercent = Math.round(position.currentPrice * 100);

  const stepContent = () => {
    switch (cashout.step) {
      case "confirm":
        return (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-xl font-bold text-slate-100 mb-2">Cash Out Position</h3>
              <p className="text-sm text-slate-500">
                Sell your shares and receive USDC to your wallet
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/50 mb-4">
              <p className="text-xs text-slate-500 mb-1">Position</p>
              <p className="text-sm font-medium text-slate-200 mb-3">{position.marketTitle}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Shares</p>
                  <p className="text-sm font-semibold text-slate-200">
                    {position.shares.toFixed(2)} {position.side.toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Current Price</p>
                  <p className="text-sm font-semibold text-slate-200">{pricePercent}¢</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-emerald-400">You will receive</span>
                <span className="text-xl font-bold text-emerald-400">
                  ~${position.currentValue.toFixed(2)} USDC
                </span>
              </div>
              <p className="text-[10px] text-emerald-400/60 mt-1">
                Final amount may vary slightly based on market conditions
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-medium hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 transition"
              >
                Confirm Cash Out
              </button>
            </div>
          </>
        );

      case "signing":
        return (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-100 mb-2">Preparing Transaction</h3>
            <p className="text-sm text-slate-500">Creating your sell order...</p>
          </div>
        );

      case "sending":
        return (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-100 mb-2">Sign Transaction</h3>
            <p className="text-sm text-slate-500">Please approve the transaction in your wallet</p>
          </div>
        );

      case "confirming":
        return (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-100 mb-2">Confirming Transaction</h3>
            <p className="text-sm text-slate-500 mb-4">Waiting for blockchain confirmation...</p>
            {cashout.signature && (
              <a
                href={`https://solscan.io/tx/${cashout.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                View on Solscan →
              </a>
            )}
          </div>
        );

      case "done":
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">Cash Out Complete!</h3>
            <p className="text-sm text-slate-500 mb-4">
              You received <span className="text-emerald-400 font-semibold">${cashout.usdcReceived?.toFixed(2)} USDC</span>
            </p>
            {cashout.signature && (
              <a
                href={`https://solscan.io/tx/${cashout.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition"
              >
                View Transaction →
              </a>
            )}
            <p className="text-xs text-slate-600 mt-4">Refreshing dashboard...</p>
          </div>
        );

      case "error":
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">Cash Out Failed</h3>
            <p className="text-sm text-red-400 mb-6">{cashout.error}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-medium hover:bg-slate-700 transition"
              >
                Close
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-400 transition"
              >
                Try Again
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={cashout.step === "confirm" || cashout.step === "error" || cashout.step === "done" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        {(cashout.step === "confirm" || cashout.step === "error" || cashout.step === "done") && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-slate-600 hover:text-slate-400 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {stepContent()}
      </div>
    </div>
  );
}
