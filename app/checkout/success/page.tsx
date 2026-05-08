"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [processing, setProcessing] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    mode?: string;
    tokensReceived?: number;
    giftId?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setProcessing(false);
      return;
    }

    async function processCheckout() {
      try {
        const res = await fetch("/api/checkout/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        const data = await res.json();

        if (!res.ok) {
          setResult({ success: false, error: data.error });
        } else {
          setResult({ success: true, ...data });
        }
      } catch (err: any) {
        setResult({ success: false, error: err.message });
      } finally {
        setProcessing(false);
      }
    }

    processCheckout();
  }, [sessionId]);

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-xl font-bold text-foreground mb-2">Processing your purchase...</h1>
          <p className="text-muted-foreground">
            Please wait while we complete your transaction.
          </p>
        </div>
      </div>
    );
  }

  if (result?.error) {
    // Translate technical errors to user-friendly messages
    let friendlyError = result.error;
    let showRefund = false;

    if (result.error.includes("insufficient funds")) {
      friendlyError = "Our system is temporarily unable to process purchases. Your payment has been refunded. Please try again later.";
      showRefund = true;
    } else if (result.error.includes("Zero out amount") || result.error.includes("zero_out_amount")) {
      friendlyError = "The purchase amount is too small for this market. Please try a larger amount (at least $5).";
    } else if (result.error.includes("Simulation failed")) {
      friendlyError = "Unable to complete the transaction. Your payment will be refunded within 5-10 business days.";
      showRefund = true;
    } else if (result.error.includes("Market not found")) {
      friendlyError = "This market is no longer available. Your payment has been refunded.";
      showRefund = true;
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-4">{friendlyError}</p>
          {showRefund && (
            <p className="text-sm text-muted-foreground mb-6">
              If you don&apos;t see your refund within 10 business days, please contact support.
            </p>
          )}
          <Link
            href="/feed"
            className="inline-block py-3 px-6 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  // Self-purchase success
  if (result?.mode === "self-purchase") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-background">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Purchase Complete!</h1>
          <p className="text-muted-foreground mb-6">
            {result.tokensReceived?.toFixed(2)} shares have been added to your wallet.
          </p>

          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="block w-full py-3 px-4 rounded-xl bg-gradient-brand text-primary-foreground font-medium hover:opacity-90 transition"
            >
              View My Positions
            </Link>
            <Link
              href="/feed"
              className="block w-full py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:border-primary/50 hover:bg-secondary/50 transition"
            >
              Back to Feed
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Default success (position purchased)
  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-background">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">Position Purchased!</h1>
        <p className="text-muted-foreground mb-6">
          Your shares have been added to your wallet. View them in your portfolio.
        </p>

        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="block w-full py-3 px-4 rounded-xl bg-gradient-brand text-primary-foreground font-medium hover:opacity-90 transition"
          >
            View Portfolio
          </Link>
          <Link
            href="/"
            className="block w-full py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:border-primary/50 hover:bg-secondary/50 transition"
          >
            Browse More Markets
          </Link>
        </div>

        {sessionId && (
          <p className="mt-6 text-xs text-muted-foreground">
            Session: {sessionId.slice(0, 20)}...
          </p>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Loading...</p></div>}>
      <SuccessContent />
    </Suspense>
  );
}
