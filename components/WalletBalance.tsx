"use client";

import { useEffect, useState, useCallback } from "react";

interface WalletBalanceProps {
  walletAddress: string | null;
  onBalanceUpdate?: (balance: number) => void;
}

export function WalletBalance({ walletAddress, onBalanceUpdate }: WalletBalanceProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/wallet/balance?address=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        setBalance(data.usdcBalance);
        onBalanceUpdate?.(data.usdcBalance);
      }
    } catch (err) {
      console.error("Error fetching balance:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, onBalanceUpdate]);

  useEffect(() => {
    fetchBalance();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  if (!walletAddress) {
    return null;
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500 uppercase tracking-wide">USDC Balance</span>
        <button
          onClick={fetchBalance}
          disabled={loading}
          className="text-xs text-slate-500 hover:text-slate-300 transition"
        >
          {loading ? "..." : "↻"}
        </button>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-100">
          {balance !== null ? `$${balance.toFixed(2)}` : "—"}
        </span>
        {loading && <span className="text-xs text-slate-500">updating...</span>}
      </div>
      <p className="text-[10px] text-slate-600 mt-1 font-mono">
        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
      </p>
    </div>
  );
}
