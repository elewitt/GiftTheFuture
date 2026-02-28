"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import bs58 from "bs58";

interface KYCVerificationProps {
  onVerified?: () => void;
  onClose?: () => void;
  showAsModal?: boolean;
}

export function KYCVerification({ onVerified, onClose, showAsModal = true }: KYCVerificationProps) {
  const { user, authenticated, signMessage } = usePrivy();
  const [kycStatus, setKycStatus] = useState<"loading" | "verified" | "unverified" | "error">("loading");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the user's embedded wallet address
  const walletAddress = user?.wallet?.address;

  // Check KYC status on mount and when wallet changes
  const checkKYCStatus = useCallback(async () => {
    if (!walletAddress) {
      setKycStatus("loading");
      return;
    }

    try {
      const res = await fetch(`/api/kyc/status?wallet=${walletAddress}`);
      const data = await res.json();

      if (data.verified) {
        setKycStatus("verified");
        onVerified?.();
      } else {
        setKycStatus("unverified");
      }
    } catch (err) {
      console.error("Failed to check KYC status:", err);
      setKycStatus("error");
    }
  }, [walletAddress, onVerified]);

  useEffect(() => {
    if (authenticated && walletAddress) {
      checkKYCStatus();
    }
  }, [authenticated, walletAddress, checkKYCStatus]);

  // Generate verification link and redirect
  const handleStartVerification = async () => {
    if (!walletAddress || !signMessage) {
      setError("Wallet not available. Please try again.");
      return;
    }

    setIsGeneratingLink(true);
    setError(null);

    try {
      // Generate timestamp
      const timestamp = Date.now();

      // Create the message to sign
      const message = `Proof KYC verification: ${timestamp}`;

      // Sign the message using Privy's embedded wallet
      // Privy returns { signature: string } for Solana wallets
      const signResult = await signMessage({ message });

      // Extract signature - Privy returns it as a base58 string for Solana
      let signatureBase58: string;

      if (typeof signResult === "object" && signResult !== null && "signature" in signResult) {
        // Privy returns { signature: string }
        signatureBase58 = (signResult as { signature: string }).signature;
      } else if (typeof signResult === "string") {
        signatureBase58 = signResult;
      } else {
        throw new Error("Unexpected signature format");
      }

      // If it's hex, convert to base58
      if (signatureBase58.startsWith("0x")) {
        const bytes = Buffer.from(signatureBase58.slice(2), "hex");
        signatureBase58 = bs58.encode(bytes);
      }

      // Build the verification URL
      const redirectUri = window.location.origin + "/kyc/callback";
      const verificationUrl = new URL("https://dflow.net/proof");
      verificationUrl.searchParams.set("wallet", walletAddress);
      verificationUrl.searchParams.set("signature", signatureBase58);
      verificationUrl.searchParams.set("timestamp", timestamp.toString());
      verificationUrl.searchParams.set("redirect_uri", redirectUri);

      // Store that we're in verification flow
      sessionStorage.setItem("kyc_pending", "true");
      sessionStorage.setItem("kyc_wallet", walletAddress);

      // Redirect to Proof verification
      window.location.href = verificationUrl.toString();
    } catch (err: any) {
      console.error("Failed to generate verification link:", err);
      setError(err.message || "Failed to sign verification message. Please try again.");
      setIsGeneratingLink(false);
    }
  };

  // When shown on-demand (with onClose), always render the modal
  // Otherwise, don't render if verified or not authenticated
  if (!onClose) {
    if (!authenticated || kycStatus === "verified") {
      return null;
    }

    // Loading state
    if (kycStatus === "loading") {
      return null; // Don't show anything while checking
    }
  }

  const content = (
    <div className="text-center">
      <div className="text-5xl mb-4">🔐</div>
      <h2 className="text-xl font-bold text-foreground mb-2">
        Identity Verification Required
      </h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
        To trade prediction markets, you need to complete a one-time identity verification.
        This takes about 2 minutes.
      </p>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <Button
        onClick={handleStartVerification}
        disabled={isGeneratingLink}
        size="lg"
        className="w-full max-w-xs"
      >
        {isGeneratingLink ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Preparing...
          </span>
        ) : (
          "Verify Identity"
        )}
      </Button>

      {onClose && (
        <button
          onClick={onClose}
          className="block w-full text-sm text-muted-foreground hover:text-foreground mt-4 transition"
        >
          Maybe Later
        </button>
      )}

      <p className="text-[10px] text-muted-foreground mt-4">
        Powered by DFlow Proof · Secure identity verification
      </p>
    </div>
  );

  if (showAsModal) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-card border border-border rounded-2xl p-8 max-w-md w-full shadow-2xl"
          >
            {content}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-8">
      {content}
    </div>
  );
}

/**
 * Hook to check KYC status
 */
export function useKYCStatus() {
  const { user, authenticated } = usePrivy();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const walletAddress = user?.wallet?.address;

  const checkStatus = useCallback(async () => {
    if (!walletAddress) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/kyc/status?wallet=${walletAddress}`);
      const data = await res.json();
      setVerified(data.verified === true);
    } catch {
      setVerified(false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (authenticated && walletAddress) {
      checkStatus();
    } else {
      setLoading(false);
    }
  }, [authenticated, walletAddress, checkStatus]);

  return { verified, loading, refetch: checkStatus };
}
