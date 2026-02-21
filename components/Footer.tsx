"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-8 md:flex-row">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-brand flex items-center justify-center text-base">
            🎁
          </div>
          <span className="text-sm font-semibold text-foreground">
            Gift the Future
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Gift the Future. Powered by Kalshi.
        </p>
      </div>
    </footer>
  );
}
