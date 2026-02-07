/**
 * Gift Store - Prisma/Postgres version
 */

import prisma from "./prisma";

// ─── Types ───────────────────────────────────────────────────

export type GiftStatus =
  | "pending_payment"
  | "pending_claim"
  | "claimed"
  | "cashed_out"
  | "settled"
  | "expired";

export interface Gift {
  id: string;
  marketTicker: string;
  marketTitle: string;
  side: "yes" | "no";
  outcomeMint: string;
  tokenAmount: number;
  costUSDC: number;
  senderPrivyId: string;
  senderEmail?: string | null;
  recipientName: string;
  recipientContact: string;
  giftMessage?: string | null;
  recipientWalletAddress?: string | null;
  recipientPrivyId?: string | null;
  status: GiftStatus;
  purchaseTxSig?: string | null;
  claimTxSig?: string | null;
  createdAt: Date;
  claimedAt?: Date | null;
}

// ─── Database Operations ─────────────────────────────────────

export async function createGift(
  data: Omit<Gift, "id" | "status" | "createdAt" | "claimedAt">
): Promise<Gift> {
  const gift = await prisma.gift.create({
    data: {
      marketTicker: data.marketTicker,
      marketTitle: data.marketTitle,
      side: data.side,
      outcomeMint: data.outcomeMint,
      tokenAmount: data.tokenAmount,
      costUSDC: data.costUSDC,
      senderPrivyId: data.senderPrivyId,
      senderEmail: data.senderEmail,
      recipientName: data.recipientName,
      recipientContact: data.recipientContact,
      giftMessage: data.giftMessage,
      status: "pending_payment",
    },
  });

  return gift as Gift;
}

export async function getGift(id: string): Promise<Gift | null> {
  const gift = await prisma.gift.findUnique({
    where: { id },
  });

  return gift as Gift | null;
}

export async function updateGift(
  id: string,
  updates: Partial<Gift>
): Promise<Gift | null> {
  try {
    const gift = await prisma.gift.update({
      where: { id },
      data: updates,
    });

    return gift as Gift;
  } catch {
    return null;
  }
}

export async function getGiftsByRecipient(contact: string): Promise<Gift[]> {
  const gifts = await prisma.gift.findMany({
    where: { recipientContact: contact },
    orderBy: { createdAt: "desc" },
  });

  return gifts as Gift[];
}

export async function getGiftsBySender(privyId: string): Promise<Gift[]> {
  const gifts = await prisma.gift.findMany({
    where: { senderPrivyId: privyId },
    orderBy: { createdAt: "desc" },
  });

  return gifts as Gift[];
}

export async function getGiftsByRecipientPrivyId(privyId: string): Promise<Gift[]> {
  const gifts = await prisma.gift.findMany({
    where: { recipientPrivyId: privyId },
    orderBy: { createdAt: "desc" },
  });

  return gifts as Gift[];
}
