import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMarket, transformMarket } from "@/lib/kalshi";
import { getPositions, Position } from "@/lib/solana";

/**
 * GET /api/user/dashboard?privyId=xxx&email=xxx&walletAddress=xxx
 *
 * Returns dashboard data for a user:
 * - On-chain positions (from wallet)
 * - Claimed gifts (positions from database, merged with on-chain)
 * - Sent gifts
 * - Pending gifts to claim
 * - Current market prices
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const privyId = searchParams.get("privyId");
    const email = searchParams.get("email");
    const walletAddress = searchParams.get("walletAddress");

    if (!privyId && !email) {
      return NextResponse.json(
        { error: "Missing privyId or email" },
        { status: 400 }
      );
    }

    // Build sender query - match by Privy ID OR email (since gifts created via Stripe use email)
    const senderConditions = [];
    if (privyId) senderConditions.push({ senderPrivyId: privyId });
    if (email) senderConditions.push({ senderPrivyId: email });

    // Fetch on-chain positions if wallet address provided
    let onChainPositions: Position[] = [];
    if (walletAddress) {
      try {
        onChainPositions = await getPositions(walletAddress);
      } catch (err) {
        console.error("[Dashboard] Failed to fetch on-chain positions:", err);
      }
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

      // Gifts this user has sent (match by Privy ID or email)
      senderConditions.length > 0
        ? prisma.gift.findMany({
            where: { OR: senderConditions },
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

    // Get unique market tickers to fetch prices (include on-chain positions)
    const allGifts = [...claimedGifts, ...sentGifts, ...pendingGifts];
    const giftTickers = allGifts.map((g) => g.marketTicker);
    const onChainTickers = onChainPositions
      .filter((p) => p.market?.ticker)
      .map((p) => p.market!.ticker);
    const uniqueTickers = [...new Set([...giftTickers, ...onChainTickers])];

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

    // Build positions from on-chain data first (source of truth)
    const onChainPositionsByMint = new Map<string, Position>();
    for (const pos of onChainPositions) {
      onChainPositionsByMint.set(pos.mint, pos);
    }

    // Get mints from claimed gifts to avoid duplicates
    const claimedMints = new Set(claimedGifts.filter(g => g.outcomeMint).map(g => g.outcomeMint));

    // Convert on-chain positions (that aren't from claimed gifts) to position format
    const onChainOnlyPositions = onChainPositions
      .filter((pos) => !claimedMints.has(pos.mint) && pos.market)
      .map((pos) => {
        const prices = marketPrices[pos.market!.ticker] || { yesPrice: 0.5, noPrice: 0.5, status: "unknown" };
        const side = pos.side === "YES" ? "yes" : pos.side === "NO" ? "no" : "yes";
        const currentPrice = side === "yes" ? prices.yesPrice : prices.noPrice;

        return {
          id: `onchain-${pos.mint}`,
          marketTicker: pos.market!.ticker,
          marketTitle: pos.market!.title,
          side,
          shares: pos.balance,
          costBasis: pos.balance * currentPrice, // Estimate cost basis from current price
          currentPrice,
          currentValue: pos.balance * currentPrice,
          potentialPayout: pos.balance,
          profitLoss: 0, // Can't calculate without knowing purchase price
          marketStatus: pos.market!.status,
          claimedAt: null,
          outcomeMint: pos.mint,
          isOnChain: true,
        };
      });

    // Enrich claimed gifts with current prices (these are the user's positions from database)
    const claimedPositions = claimedGifts
      .filter((g) => g.status === "claimed") // Only active positions
      .map((gift) => {
        const prices = marketPrices[gift.marketTicker] || { yesPrice: 0.5, noPrice: 0.5, status: "unknown" };
        const currentPrice = gift.side === "yes" ? prices.yesPrice : prices.noPrice;

        // Use on-chain balance if available (more accurate)
        const onChainPos = gift.outcomeMint ? onChainPositionsByMint.get(gift.outcomeMint) : null;
        const tokenAmount = onChainPos ? onChainPos.balance : gift.tokenAmount / 1_000_000;

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
          isOnChain: false,
        };
      });

    // Combine: on-chain only positions + claimed gift positions
    const positions = [...onChainOnlyPositions, ...claimedPositions];

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
