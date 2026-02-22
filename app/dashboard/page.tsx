"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { VersionedTransaction, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

type WithdrawStep = "form" | "confirming" | "sending" | "done" | "error";

interface WithdrawState {
  isOpen: boolean;
  step: WithdrawStep;
  destinationAddress: string;
  amount: string;
  error: string | null;
  signature: string | null;
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

  // Withdraw modal state
  const [withdraw, setWithdraw] = useState<WithdrawState>({
    isOpen: false,
    step: "form",
    destinationAddress: "",
    amount: "",
    error: null,
    signature: null,
  });

  // USDC balance
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);

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

  // Fetch USDC and SOL balances
  useEffect(() => {
    if (!wallets.length) return;

    const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
    if (!wallet?.address) return;

    async function fetchBalances() {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
        const connection = new Connection(rpcUrl, "confirmed");
        const pubkey = new PublicKey(wallet.address);

        // Fetch SOL balance
        const solBal = await connection.getBalance(pubkey);
        setSolBalance(solBal / 1_000_000_000); // Convert lamports to SOL

        // Fetch USDC balance
        try {
          const usdcMint = new PublicKey(USDC_MINT);
          const ata = getAssociatedTokenAddressSync(usdcMint, pubkey);
          const tokenBalance = await connection.getTokenAccountBalance(ata);
          setUsdcBalance(Number(tokenBalance.value.uiAmount) || 0);
        } catch {
          setUsdcBalance(0); // No USDC account
        }
      } catch (err) {
        console.error("Failed to fetch balances:", err);
      }
    }

    fetchBalances();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [wallets]);

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
      setCashout((prev) => ({ ...prev, step: "signing" }));

      // Step 1: Ensure user has SOL for gas fees (airdrop if needed)
      try {
        const airdropRes = await fetch("/api/solana/airdrop-sol", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: wallet.address }),
        });
        const airdropData = await airdropRes.json();

        if (!airdropRes.ok) {
          console.error("Airdrop failed:", airdropData.error);
          // If airdrop failed due to fee payer being empty, show user-friendly error
          if (airdropData.error?.includes("Fee payer wallet needs more SOL")) {
            throw new Error("Service temporarily unavailable. Please try again later or contact support.");
          }
        } else if (airdropData.signature) {
          // Wait a moment for the airdrop transaction to be confirmed
          console.log("Airdrop sent, waiting for confirmation...", airdropData.signature);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (airdropErr: any) {
        // If it's our thrown error, re-throw it
        if (airdropErr.message?.includes("Service temporarily unavailable")) {
          throw airdropErr;
        }
        console.log("Airdrop skipped or failed, continuing anyway:", airdropErr);
      }

      // Step 2: Get the transaction from DFlow
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

      // Step 3: Deserialize and sign the transaction
      const txBuffer = Buffer.from(base64Tx, "base64");
      const transaction = VersionedTransaction.deserialize(new Uint8Array(txBuffer));

      setCashout((prev) => ({ ...prev, step: "sending" }));

      // Sign with Privy wallet
      const signedTx = await wallet.signTransaction(transaction);

      // Step 4: Send the transaction
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

      // Step 5: Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      // Step 6: Update gift status in database
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

      // Parse the error for user-friendly messages
      let errorMessage = err.message || "Cashout failed";

      if (errorMessage.includes("debit an account") || errorMessage.includes("no record of a prior credit")) {
        errorMessage = "Transaction failed. Please try again or contact support.";
      } else if (errorMessage.includes("insufficient funds") || errorMessage.includes("Insufficient")) {
        errorMessage = "Insufficient funds for this transaction. Please check your wallet balance.";
      } else if (errorMessage.includes("simulation failed")) {
        errorMessage = "Transaction simulation failed. The position may have already been sold or expired.";
      }

      setCashout((prev) => ({
        ...prev,
        step: "error",
        error: errorMessage,
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

  // Withdraw handlers
  const openWithdrawModal = () => {
    setWithdraw({
      isOpen: true,
      step: "form",
      destinationAddress: "",
      amount: usdcBalance?.toFixed(2) || "",
      error: null,
      signature: null,
    });
  };

  const closeWithdrawModal = () => {
    setWithdraw({
      isOpen: false,
      step: "form",
      destinationAddress: "",
      amount: "",
      error: null,
      signature: null,
    });
  };

  const handleWithdraw = useCallback(async () => {
    const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
    if (!wallet) {
      setWithdraw((prev) => ({ ...prev, step: "error", error: "No wallet found" }));
      return;
    }

    const amount = parseFloat(withdraw.amount);
    if (isNaN(amount) || amount <= 0) {
      setWithdraw((prev) => ({ ...prev, step: "error", error: "Invalid amount" }));
      return;
    }

    if (amount > (usdcBalance || 0)) {
      setWithdraw((prev) => ({ ...prev, step: "error", error: "Insufficient USDC balance" }));
      return;
    }

    let destinationPubkey: PublicKey;
    try {
      destinationPubkey = new PublicKey(withdraw.destinationAddress);
    } catch {
      setWithdraw((prev) => ({ ...prev, step: "error", error: "Invalid Solana wallet address" }));
      return;
    }

    try {
      setWithdraw((prev) => ({ ...prev, step: "confirming" }));

      // Ensure user has SOL for gas fees (airdrop if needed)
      try {
        const airdropRes = await fetch("/api/solana/airdrop-sol", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAddress: wallet.address }),
        });
        const airdropData = await airdropRes.json();

        if (!airdropRes.ok) {
          console.error("Airdrop failed:", airdropData.error);
          if (airdropData.error?.includes("Fee payer wallet needs more SOL")) {
            throw new Error("Service temporarily unavailable. Please try again later or contact support.");
          }
        } else if (airdropData.signature) {
          console.log("Airdrop sent, waiting for confirmation...", airdropData.signature);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (airdropErr: any) {
        if (airdropErr.message?.includes("Service temporarily unavailable")) {
          throw airdropErr;
        }
        console.log("Airdrop skipped or failed, continuing anyway:", airdropErr);
      }

      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const senderPubkey = new PublicKey(wallet.address);
      const usdcMint = new PublicKey(USDC_MINT);

      // Get ATAs
      const senderATA = getAssociatedTokenAddressSync(usdcMint, senderPubkey);
      const destinationATA = getAssociatedTokenAddressSync(usdcMint, destinationPubkey);

      // Build transaction
      const tx = new Transaction();

      // Check if destination ATA exists, if not create it
      const destATAInfo = await connection.getAccountInfo(destinationATA);
      if (!destATAInfo) {
        const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
        tx.add(
          createAssociatedTokenAccountInstruction(
            senderPubkey, // payer
            destinationATA, // ATA address
            destinationPubkey, // owner
            usdcMint // mint
          )
        );
      }

      // Add transfer instruction
      const amountLamports = Math.floor(amount * 1_000_000); // USDC has 6 decimals
      tx.add(
        createTransferInstruction(
          senderATA,
          destinationATA,
          senderPubkey,
          amountLamports
        )
      );

      // Set recent blockhash and fee payer
      const latestBlockhash = await connection.getLatestBlockhash();
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = senderPubkey;

      setWithdraw((prev) => ({ ...prev, step: "sending" }));

      // Sign with Privy wallet
      const signedTx = await wallet.signTransaction(tx);

      // Send transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      setWithdraw((prev) => ({ ...prev, step: "done", signature }));

      // Update balance after a delay
      setTimeout(() => {
        setUsdcBalance((prev) => (prev || 0) - amount);
      }, 2000);
    } catch (err: any) {
      console.error("Withdraw error:", err);

      // Parse the error for user-friendly messages
      let errorMessage = err.message || "Withdrawal failed";

      if (errorMessage.includes("debit an account") || errorMessage.includes("no record of a prior credit")) {
        errorMessage = "Your wallet doesn't have enough SOL for transaction fees. Please add at least 0.01 SOL to your wallet.";
      } else if (errorMessage.includes("insufficient funds") || errorMessage.includes("Insufficient")) {
        errorMessage = "Insufficient USDC balance for this withdrawal.";
      } else if (errorMessage.includes("simulation failed")) {
        errorMessage = "Transaction simulation failed. Please check your wallet balance and try again.";
      }

      setWithdraw((prev) => ({
        ...prev,
        step: "error",
        error: errorMessage,
      }));
    }
  }, [withdraw.destinationAddress, withdraw.amount, wallets, usdcBalance]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-sm"
        >
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">📊</span>
          </div>
          <h1 className="text-2xl font-bold mb-3 text-foreground">Your Dashboard</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Sign in to see your prediction market positions, track your gifts, and cash out anytime.
          </p>
          <Button onClick={login} size="lg" className="w-full">
            Sign In to Continue
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 max-w-5xl mx-auto px-5 pb-20">
        {/* Summary Cards */}
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
          >
            <SummaryCard
              label="Portfolio Value"
              value={`$${data.summary.totalValue.toFixed(2)}`}
              subtext={`${data.summary.positionCount} position${data.summary.positionCount !== 1 ? "s" : ""}`}
              color="primary"
            />
            <SummaryCard
              label="Potential Payout"
              value={`$${data.summary.totalPotential.toFixed(2)}`}
              subtext="If all correct"
              color="accent"
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
          </motion.div>
        )}

        {/* Wallet Balance Card */}
        {wallets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Wallet Balance</p>
                <p className="text-2xl font-bold text-primary">
                  ${usdcBalance !== null ? usdcBalance.toFixed(2) : "—"} <span className="text-base font-normal text-muted-foreground">USDC</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {solBalance !== null ? `${solBalance.toFixed(4)} SOL for fees` : "Loading..."}
                </p>
              </div>
              <Button
                onClick={openWithdrawModal}
                disabled={!usdcBalance || usdcBalance <= 0}
                variant="success"
              >
                Withdraw USDC
              </Button>
            </div>
            <div className="pt-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground mb-1">Your wallet address</p>
              <p className="text-xs text-foreground font-mono break-all">
                {wallets.find((w) => w.walletClientType === "privy")?.address || wallets[0]?.address}
              </p>
            </div>
          </motion.div>
        )}

        {/* Pending Gifts Alert */}
        {data && data.pending.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-6 p-4 rounded-xl bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/20"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎁</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  You have {data.pending.length} gift{data.pending.length > 1 ? "s" : ""} waiting!
                </p>
                <p className="text-xs text-muted-foreground">
                  Click the Pending tab to claim your positions.
                </p>
              </div>
              <Button
                onClick={() => setActiveTab("pending")}
                variant="outline"
                size="sm"
              >
                View Gifts
              </Button>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex gap-1 p-1 bg-secondary/50 rounded-xl mb-6 w-fit"
        >
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
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-destructive mb-2">Failed to load dashboard</p>
            <p className="text-xs text-muted-foreground">{error}</p>
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
          <Link href="/">
            <Button variant="secondary">
              🔍 Browse Markets & Send a Gift
            </Button>
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

      {/* Withdraw Modal */}
      {withdraw.isOpen && (
        <WithdrawModal
          withdraw={withdraw}
          usdcBalance={usdcBalance || 0}
          onAmountChange={(amount) => setWithdraw((prev) => ({ ...prev, amount }))}
          onAddressChange={(address) => setWithdraw((prev) => ({ ...prev, destinationAddress: address }))}
          onConfirm={handleWithdraw}
          onClose={closeWithdrawModal}
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
  color: "primary" | "accent" | "emerald" | "red" | "violet";
}) {
  const colorClasses = {
    primary: "from-primary/10 to-primary/5 border-primary/20",
    accent: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
    red: "from-red-500/10 to-red-500/5 border-red-500/20",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/20",
  };

  const textColors = {
    primary: "text-primary",
    accent: "text-amber-600",
    emerald: "text-emerald-600",
    red: "text-red-600",
    violet: "text-violet-600",
  };

  return (
    <div className={`p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]} border`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${textColors[color]}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{subtext}</p>
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
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            highlight
              ? "bg-accent/20 text-amber-600"
              : active
              ? "bg-secondary text-muted-foreground"
              : "bg-secondary/50 text-muted-foreground"
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
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📭</span>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No positions yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
          When someone sends you a prediction market gift and you claim it, your position will appear here.
        </p>
        <Link href="/">
          <Button>Browse Markets</Button>
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-2xl bg-card border border-border"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                position.side === "yes"
                  ? "bg-yes/10 text-yes"
                  : "bg-no/10 text-no"
              }`}
            >
              {position.side}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {position.marketStatus === "open" ? "🟢 Active" : "⚪ " + position.marketStatus}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug">
            {position.marketTitle}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">${position.currentValue.toFixed(2)}</p>
          <p className={`text-xs font-medium ${isProfit ? "text-emerald-600" : "text-red-600"}`}>
            {isProfit ? "+" : ""}${position.profitLoss.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Price Bar */}
      <div className="mb-4">
        <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pricePercent}%`, backgroundColor: "hsl(var(--yes))" }}
          />
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${100 - pricePercent}%`, backgroundColor: "hsl(var(--no))" }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span style={{ color: "hsl(var(--yes))" }}>Yes {pricePercent}¢</span>
          <span style={{ color: "hsl(var(--no))" }}>No {100 - pricePercent}¢</span>
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
      <div className="flex gap-2 mt-4 pt-4 border-t border-border">
        <Button variant="secondary" size="sm" className="flex-1">
          Hold Position
        </Button>
        <Button
          onClick={() => onCashout(position)}
          variant="success"
          size="sm"
          className="flex-1"
        >
          Cash Out · ${position.currentValue.toFixed(2)}
        </Button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-amber-600" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function SentTab({ gifts }: { gifts: SentGift[] }) {
  if (gifts.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🎁</span>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No gifts sent yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
          Send someone a prediction market position as a gift. They'll receive an email with a link to claim it.
        </p>
        <Link href="/">
          <Button>Send a Gift</Button>
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
    pending_claim: "bg-amber-500/10 text-amber-600",
    claimed: "bg-primary/10 text-primary",
    cashed_out: "bg-blue-500/10 text-blue-600",
    settled: "bg-secondary text-muted-foreground",
  };

  const statusLabels: Record<string, string> = {
    pending_claim: "Pending",
    claimed: "Claimed",
    cashed_out: "Cashed Out",
    settled: "Settled",
  };

  return (
    <div className="p-4 rounded-xl bg-card border border-border">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[gift.status] || "bg-secondary text-muted-foreground"}`}>
              {statusLabels[gift.status] || gift.status}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(gift.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground mb-1">{gift.marketTitle}</p>
          <p className="text-xs text-muted-foreground">
            To: {gift.recipientName || gift.recipientContact}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground">${gift.costUSDC.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">{gift.shares.toFixed(1)} shares</p>
        </div>
      </div>
    </div>
  );
}

function PendingTab({ gifts }: { gifts: PendingGift[] }) {
  if (gifts.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-2xl bg-gradient-to-br from-accent/5 to-accent/10 border border-accent/20"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎁</span>
            <span className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">
              New Gift!
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">{gift.marketTitle}</h3>
          {gift.giftMessage && (
            <p className="text-xs text-muted-foreground mt-1 italic">&quot;{gift.giftMessage}&quot;</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-amber-600">${gift.potentialPayout.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">if {gift.side.toUpperCase()} wins</p>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 mb-4">
        <div>
          <p className="text-[10px] text-muted-foreground">Position</p>
          <p className="text-sm font-semibold text-foreground">
            {gift.shares.toFixed(1)} x{" "}
            <span style={{ color: gift.side === "yes" ? "hsl(var(--yes))" : "hsl(var(--no))" }}>
              {gift.side.toUpperCase()}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Current Value</p>
          <p className="text-sm font-semibold text-foreground">${gift.currentValue.toFixed(2)}</p>
        </div>
      </div>

      <Link href={`/gift/${gift.id}`}>
        <Button className="w-full">
          Claim This Gift →
        </Button>
      </Link>
    </motion.div>
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
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Cash Out Position</h3>
              <p className="text-sm text-muted-foreground">
                Sell your shares and receive USDC to your wallet
              </p>
            </div>

            <div className="p-4 rounded-xl bg-secondary/50 mb-4">
              <p className="text-xs text-muted-foreground mb-1">Position</p>
              <p className="text-sm font-medium text-foreground mb-3">{position.marketTitle}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Shares</p>
                  <p className="text-sm font-semibold text-foreground">
                    {position.shares.toFixed(2)} {position.side.toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Price</p>
                  <p className="text-sm font-semibold text-foreground">{pricePercent}¢</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-primary">You will receive</span>
                <span className="text-xl font-bold text-primary">
                  ~${position.currentValue.toFixed(2)} USDC
                </span>
              </div>
              <p className="text-[10px] text-primary/60 mt-1">
                Final amount may vary slightly based on market conditions
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={onClose} variant="secondary" className="flex-1">
                Cancel
              </Button>
              <Button onClick={onConfirm} variant="success" className="flex-1">
                Confirm Cash Out
              </Button>
            </div>
          </>
        );

      case "signing":
      case "sending":
      case "confirming":
        return (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">
              {cashout.step === "signing" ? "Preparing Transaction" : cashout.step === "sending" ? "Sign Transaction" : "Confirming Transaction"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {cashout.step === "signing" ? "Creating your sell order..." : cashout.step === "sending" ? "Please approve in your wallet" : "Waiting for blockchain confirmation..."}
            </p>
            {cashout.signature && (
              <a
                href={`https://solscan.io/tx/${cashout.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:text-primary/80 mt-4 inline-block"
              >
                View on Solscan →
              </a>
            )}
          </div>
        );

      case "done":
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Cash Out Complete!</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You received <span className="text-primary font-semibold">${cashout.usdcReceived?.toFixed(2)} USDC</span>
            </p>
            {cashout.signature && (
              <a
                href={`https://solscan.io/tx/${cashout.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
              >
                <Button variant="secondary" size="sm">
                  View Transaction →
                </Button>
              </a>
            )}
            <p className="text-xs text-muted-foreground mt-4">Refreshing dashboard...</p>
          </div>
        );

      case "error":
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Cash Out Failed</h3>
            <p className="text-sm text-destructive mb-6">{cashout.error}</p>
            <div className="flex gap-3">
              <Button onClick={onClose} variant="secondary" className="flex-1">
                Close
              </Button>
              <Button onClick={onConfirm} className="flex-1">
                Try Again
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={cashout.step === "confirm" || cashout.step === "error" || cashout.step === "done" ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl"
      >
        {(cashout.step === "confirm" || cashout.step === "error" || cashout.step === "done") && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {stepContent()}
      </motion.div>
    </div>
  );
}

function WithdrawModal({
  withdraw,
  usdcBalance,
  onAmountChange,
  onAddressChange,
  onConfirm,
  onClose,
}: {
  withdraw: WithdrawState;
  usdcBalance: number;
  onAmountChange: (amount: string) => void;
  onAddressChange: (address: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const stepContent = () => {
    switch (withdraw.step) {
      case "form":
        return (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💸</span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Withdraw USDC</h3>
              <p className="text-sm text-muted-foreground">
                Send USDC to any Solana wallet
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Destination Wallet Address
              </label>
              <Input
                type="text"
                placeholder="Enter Solana wallet address..."
                value={withdraw.destinationAddress}
                onChange={(e) => onAddressChange(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Amount (USDC)
              </label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={usdcBalance}
                  placeholder="0.00"
                  value={withdraw.amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                />
                <button
                  onClick={() => onAmountChange(usdcBalance.toFixed(2))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition"
                >
                  MAX
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Available: ${usdcBalance.toFixed(2)} USDC
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6">
              <p className="text-xs text-amber-600">
                <strong>Note:</strong> You'll need a small amount of SOL in your wallet to pay for transaction fees (~0.001 SOL).
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={onClose} variant="secondary" className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                disabled={!withdraw.destinationAddress || !withdraw.amount}
                variant="success"
                className="flex-1"
              >
                Withdraw
              </Button>
            </div>
          </>
        );

      case "confirming":
      case "sending":
        return (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">
              {withdraw.step === "confirming" ? "Preparing Transaction" : "Sign Transaction"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {withdraw.step === "confirming" ? "Building your withdrawal..." : "Please approve in your wallet..."}
            </p>
          </div>
        );

      case "done":
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Withdrawal Complete!</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sent <span className="text-primary font-semibold">${withdraw.amount} USDC</span>
            </p>
            {withdraw.signature && (
              <a
                href={`https://solscan.io/tx/${withdraw.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mb-4"
              >
                <Button variant="secondary" size="sm">
                  View Transaction →
                </Button>
              </a>
            )}
            <Button onClick={onClose} variant="secondary" className="w-full">
              Close
            </Button>
          </div>
        );

      case "error":
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Withdrawal Failed</h3>
            <p className="text-sm text-destructive mb-6">{withdraw.error}</p>
            <div className="flex gap-3">
              <Button onClick={onClose} variant="secondary" className="flex-1">
                Close
              </Button>
              <Button onClick={onConfirm} variant="success" className="flex-1">
                Try Again
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={withdraw.step === "form" || withdraw.step === "error" || withdraw.step === "done" ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl"
      >
        {(withdraw.step === "form" || withdraw.step === "error" || withdraw.step === "done") && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {stepContent()}
      </motion.div>
    </div>
  );
}
