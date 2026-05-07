import { NextRequest, NextResponse } from "next/server";
import { getPositions } from "@/lib/solana";
import { getPrivyIdFromRequest } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/wallet/positions?address=xxx&excludePosted=true
 *
 * Returns all prediction market positions for a wallet.
 * Queries SPL token accounts and cross-references with DFlow Metadata API.
 *
 * If excludePosted=true and user is authenticated, filters out positions
 * that the user has already posted about.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    const excludePosted = searchParams.get("excludePosted") === "true";

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    let positions = await getPositions(address);

    // Filter out already-posted positions if requested
    if (excludePosted) {
      const privyId = getPrivyIdFromRequest(req);
      if (privyId) {
        const user = await prisma.user.findUnique({
          where: { privyId },
          select: { id: true },
        });

        if (user) {
          const postedMints = await prisma.post.findMany({
            where: { authorId: user.id },
            select: { outcomeMint: true },
          });
          const postedMintSet = new Set(postedMints.map((p) => p.outcomeMint));
          positions = positions.filter((p) => !postedMintSet.has(p.mint));
        }
      }
    }

    // Enrich with current prices (in production, you'd call DFlow's price API)
    const enrichedPositions = positions.map((p) => ({
      ...p,
      currentPrice: 0.5, // Default to 50% if no price data
      currentValue: p.balance * 0.5,
    }));

    return NextResponse.json({
      address,
      positions: enrichedPositions,
      count: enrichedPositions.length,
    });
  } catch (error: any) {
    console.error("[/api/wallet/positions] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
