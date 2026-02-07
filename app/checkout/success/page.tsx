"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (sessionId) {
      // The webhook handles the actual gift creation
      // This page just shows confirmation
      setStatus("success");
    } else {
      setStatus("error");
    }
  }, [sessionId]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Processing your gift...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-slate-500 mb-6">
            We couldn&apos;t verify your payment. Please contact support if you were charged.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-xl bg-indigo-500 text-white font-medium"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-3xl mx-auto mb-6">
          ✓
        </div>
        
        <h1 className="text-2xl font-bold mb-3">Gift Sent! 🎁</h1>
        <p className="text-slate-400 mb-8">
          Your recipient will receive an email with a link to claim their prediction market position.
        </p>

        <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-8 text-left">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">What happens next?</h3>
          <ol className="space-y-3 text-sm text-slate-500">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-bold">1</span>
              <span>Recipient gets an email with their gift</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-bold">2</span>
              <span>They click the link and sign in (no wallet needed)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-bold">3</span>
              <span>The position is transferred to their wallet</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-bold">4</span>
              <span>They can hold until resolution or cash out anytime</span>
            </li>
          </ol>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition text-center"
          >
            Browse More Markets
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition text-center"
          >
            View Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
