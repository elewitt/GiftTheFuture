import { NextResponse } from "next/server";
import { listTransfers } from "@/lib/bridge";
import prisma from "@/lib/prisma";

/**
 * GET /api/bridge/withdraw?privyId=xxx
 *
 * Get withdrawal status and history.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const privyId = searchParams.get("privyId");

    if (!privyId) {
      return NextResponse.json(
        { error: "Missing privyId" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyId },
    });

    if (!user?.bridgeCustomerId) {
      return NextResponse.json({
        transfers: [],
        liquidationAddress: null,
      });
    }

    const transfers = await listTransfers(user.bridgeCustomerId);

    return NextResponse.json({
      transfers,
      liquidationAddress: user.bridgeLiquidationAddress,
    });
  } catch (error: any) {
    console.error("[/api/bridge/withdraw] GET Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get withdrawal info" },
      { status: 500 }
    );
  }
}
