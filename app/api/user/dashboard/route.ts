import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMarket, transformMarket } from "@/lib/kalshi";

/**
 * GET /api/user/dashboard?privyId=xxx&email=xxx
 *
 * Returns dashboard data for a user:
 * - Claimed gifts (positions they hold)
 * - Sent gifts
 * - Pending gifts to claim
 * - Current market prices
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const privyId = searchParams.get("privyId");
    const email = searchParams.get("email");

    if (!privyId && !email) {
      return NextResponse.json(
        { error: "Missing privyId or email" },
        { status: 400 }
      );
    }

    // Fetch gifts in parallel
    const [claimedGifts, sentGifts, pendingGifts] = await Promise.all([
      // Gifts this user has claimed (their positions)
      privyId
        ? prisma.gift.findMany({
            where: {
              recipientPrivyId: privyId,
              status: { in: ["claimed", "cashed_out", "settled"] },
            },
            orderBy: { claimedAt: "desc" },
          })
        : [],

      // Gifts this user has sent
      privyId
        ? prisma.gift.findMany({
            where: { senderPrivyId: privyId },
            orderBy: { createdAt: "desc" },
          })
        : [],

      // Gifts waiting to be claimed by this user (by email)
      email
        ? prisma.gift.findMany({
            where: {
              recipientContact: email,
              status: "pending_claim",
            },
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);

    // Get unique market tickers to fetch prices
    const allGifts = [...claimedGifts, ...sentGifts, ...pendingGifts];
    const uniqueTickers = [...new Set(allGifts.map((g) => g.marketTicker))];

    // Fetch current prices for all markets
    const marketPrices: Record<string, { yesPrice: number; noPrice: number; status: string }> = {};

    await Promise.all(
      uniqueTickers.map(async (ticker) => {
        try {
          const market = await getMarket(ticker);
          if (market) {
            const transformed = transformMarket(market);
            marketPrices[ticker] = {
              yesPrice: transformed.yesPrice,
              noPrice: transformed.noPrice,
              status: transformed.status,
            };
          }
        } catch {
          // Market may have closed/settled
          marketPrices[ticker] = { yesPrice: 0.5, noPrice: 0.5, status: "unknown" };
        }
      })
    );

    // Enrich claimed gifts with current prices (these are the user's positions)
    const positions = claimedGifts
      .filter((g) => g.status === "claimed") // Only active positions
      .map((gift) => {
        const prices = marketPrices[gift.marketTicker] || { yesPrice: 0.5, noPrice: 0.5, status: "unknown" };
        const currentPrice = gift.side === "yes" ? prices.yesPrice : prices.noPrice;
        const tokenAmount = gift.tokenAmount / 1_000_000; // Convert from raw to display

        return {
          id: gift.id,
          marketTicker: gift.marketTicker,
          marketTitle: gift.marketTitle,
          side: gift.side,
          shares: tokenAmount,
          costBasis: gift.costUSDC,
          currentPrice,
          currentValue: tokenAmount * currentPrice,
          potentialPayout: tokenAmount, // If correct, each share = $1
          profitLoss: tokenAmount * currentPrice - gift.costUSDC,
          marketStatus: prices.status,
          claimedAt: gift.claimedAt,
          outcomeMint: gift.outcomeMint,
        };
      });

    // Format sent gifts
    const sent = sentGifts.map((gift) => {
      const prices = marketPrices[gift.marketTicker] || { yesPrice: 0.5, noPrice: 0.5, status: "unknown" };
      const currentPrice = gift.side === "yes" ? prices.yesPrice : prices.noPrice;

      return {
        id: gift.id,
        marketTicker: gift.marketTicker,
        marketTitle: gift.marketTitle,
        side: gift.side,
        shares: gift.tokenAmount / 1_000_000,
        costUSDC: gift.costUSDC,
        recipientName: gift.recipientName,
        recipientContact: gift.recipientContact,
        status: gift.status,
        currentPrice,
        createdAt: gift.createdAt,
        claimedAt: gift.claimedAt,
      };
    });

    // Format pending gifts
    const pending = pendingGifts.map((gift) => {
      const prices = marketPrices[gift.marketTicker] || { yesPrice: 0.5, noPrice: 0.5, status: "unknown" };
      const currentPrice = gift.side === "yes" ? prices.yesPrice : prices.noPrice;

      return {
        id: gift.id,
        marketTicker: gift.marketTicker,
        marketTitle: gift.marketTitle,
        side: gift.side,
        shares: gift.tokenAmount / 1_000_000,
        currentPrice,
        currentValue: (gift.tokenAmount / 1_000_000) * currentPrice,
        potentialPayout: gift.tokenAmount / 1_000_000,
        giftMessage: gift.giftMessage,
        createdAt: gift.createdAt,
      };
    });

    // Calculate totals
    const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalPotential = positions.reduce((sum, p) => sum + p.potentialPayout, 0);
    const totalCostBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);

    return NextResponse.json({
      positions,
      sent,
      pending,
      summary: {
        positionCount: positions.length,
        totalValue,
        totalPotential,
        totalCostBasis,
        totalProfitLoss: totalValue - totalCostBasis,
        sentCount: sent.length,
        pendingCount: pending.length,
      },
    });
  } catch (error: any) {
    console.error("[/api/user/dashboard] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch dashboard" },
      { status: 500 }
    );
  }
}
