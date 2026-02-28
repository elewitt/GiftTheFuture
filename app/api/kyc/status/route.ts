import { NextResponse } from "next/server";

/**
 * GET /api/kyc/status?wallet={address}
 *
 * Check if a wallet is KYC verified with DFlow Proof.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://proof.dflow.net/verify/${wallet}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!res.ok) {
      throw new Error(`Proof API error: ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json({
      wallet,
      verified: data.verified === true,
    });
  } catch (error: any) {
    console.error("[/api/kyc/status] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to check KYC status", verified: false },
      { status: 500 }
    );
  }
}
