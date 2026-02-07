"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold mb-2">Gift Sent!</h1>
        <p className="text-slate-400 mb-6">
          Your gift has been purchased and the recipient will receive an email with their claim link.
        </p>

        <div className="space-y-3">
          <Link
            href="/"
            className="block w-full py-3 px-4 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-600 transition"
          >
            Send Another Gift
          </Link>
          <Link
            href="/dashboard"
            className="block w-full py-3 px-4 rounded-xl border border-slate-700 text-slate-300 font-medium hover:border-slate-600 transition"
          >
            View Dashboard
          </Link>
        </div>

        {sessionId && (
          <p className="mt-6 text-xs text-slate-600">
            Session: {sessionId.slice(0, 20)}...
          </p>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>}>
      <SuccessContent />
    </Suspense>
  );
}
