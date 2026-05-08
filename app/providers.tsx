"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

// Routes that don't require onboarding
const ONBOARDING_EXEMPT_ROUTES = [
  "/onboarding",
  "/api",
  "/gift",
  "/_next",
  "/favicon",
];

function OnboardingCheck({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!ready) return;

    // Skip check for exempt routes
    const isExempt = ONBOARDING_EXEMPT_ROUTES.some((route) => pathname.startsWith(route));
    if (isExempt) {
      setChecked(true);
      return;
    }

    // Not authenticated - no need to check onboarding
    if (!authenticated) {
      setChecked(true);
      return;
    }

    // Check onboarding status
    async function checkOnboarding() {
      try {
        const res = await fetch("/api/users/me", {
          headers: { "X-Privy-Id": user?.id || "" },
        });

        if (res.ok) {
          const data = await res.json();
          if (!data.onboardingComplete && !data.username) {
            router.push("/onboarding");
            return;
          }
        }
      } catch (err) {
        console.error("Failed to check onboarding:", err);
      }
      setChecked(true);
    }

    checkOnboarding();
  }, [ready, authenticated, user?.id, pathname, router]);

  // Show loading while checking
  if (!checked && authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR/build, render children without Privy
  if (!mounted) {
    return <>{children}</>;
  }

  if (!appId) {
    return (
      <div style={{ padding: 40, color: "#f43f5e", fontFamily: "monospace" }}>
        <h2>Missing NEXT_PUBLIC_PRIVY_APP_ID</h2>
        <p>Add your Privy App ID to <code>.env.local</code> and restart the dev server.</p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#059669", // Teal primary color
          showWalletLoginFirst: false,
          walletChainType: "solana-only",
        },
        loginMethods: ["email", "sms", "google", "apple"],
        embeddedWallets: {
          createOnLogin: "all-users",
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
      }}
    >
      <OnboardingCheck>{children}</OnboardingCheck>
    </PrivyProvider>
  );
}
