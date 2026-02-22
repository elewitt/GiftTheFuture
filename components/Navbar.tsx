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
            alt="Gift the Future"
            width={40}
            height={40}
            className="rounded-lg"
          />
          <span className="text-xl font-bold tracking-tight text-foreground">
            Gift the <span className="text-gradient-brand">Future</span>
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            How it Works
          </a>
          <a href="#markets" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Markets
          </a>
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            My Gifts
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
