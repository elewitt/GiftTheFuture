import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gift the Future — Prediction Market Gifting",
  description:
    "Gift tokenized prediction market positions. Powered by Kalshi.",
  openGraph: {
    title: "Gift the Future",
    description: "Someone sent you a stake in the future. Claim it now.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
