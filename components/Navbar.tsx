"use client";

import { usePrivy, useLogin } from "@privy-io/react-auth";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Future Markets"
            width={40}
            height={40}
            className="rounded-lg"
          />
          <span className="text-xl font-bold tracking-tight text-foreground">
            Future <span className="text-gradient-brand">Markets</span>
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/feed"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            Feed
          </Link>
          <a
            href="/#markets"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Markets
          </a>
          <Link
            href="/channels"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            Channels
          </Link>
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Portfolio
          </Link>
          {ready && (
            authenticated ? (
              <Button variant="outline" size="sm" onClick={logout}>
                Sign Out
              </Button>
            ) : (
              <Button size="sm" className="bg-gradient-brand font-semibold text-primary-foreground hover:opacity-90" onClick={login}>
                Sign In
              </Button>
            )
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-3 md:hidden">
          {ready && (
            authenticated ? (
              <Button variant="outline" size="sm" onClick={logout}>
                Sign Out
              </Button>
            ) : (
              <Button size="sm" className="bg-gradient-brand" onClick={login}>
                Sign In
              </Button>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
