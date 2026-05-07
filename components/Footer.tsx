"use client";

import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-8 md:flex-row">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Future Markets"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-sm font-semibold text-foreground">
            Future Markets
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Future Markets. Powered by Kalshi.
        </p>
      </div>
    </footer>
  );
}
