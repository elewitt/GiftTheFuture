"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <div style={{ padding: 40, color: "#f43f5e", fontFamily: "monospace" }}>
        <h2>⚠️ Missing NEXT_PUBLIC_PRIVY_APP_ID</h2>
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
          accentColor: "#6366f1",
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
      {children}
    </PrivyProvider>
  );
}
