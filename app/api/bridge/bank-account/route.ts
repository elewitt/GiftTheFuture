import { NextResponse } from "next/server";
import {
  getPlaidLinkToken,
  exchangePlaidToken,
  listExternalAccounts,
  createLiquidationAddress,
} from "@/lib/bridge";
import prisma from "@/lib/prisma";

/**
 * GET /api/bridge/bank-account?privyId=xxx
 *
 * Get Plaid link token for connecting a bank account,
 * or return existing linked accounts.
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
      return NextResponse.json(
        { error: "No Bridge customer found. Please complete onboarding first." },
        { status: 400 }
      );
    }

    // Check for existing linked accounts
    const accounts = await listExternalAccounts(user.bridgeCustomerId);

    if (accounts.length > 0) {
      return NextResponse.json({
        hasAccount: true,
        accounts,
        liquidationAddress: user.bridgeLiquidationAddress,
      });
    }

    // Get Plaid link token for new account
    const { link_token } = await getPlaidLinkToken(user.bridgeCustomerId);

    return NextResponse.json({
      hasAccount: false,
      plaidLinkToken: link_token,
    });
  } catch (error: any) {
    console.error("[/api/bridge/bank-account] GET Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get bank account info" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bridge/bank-account
 *
 * Exchange Plaid public token to link a bank account,
 * then create a liquidation address for USDC withdrawals.
 *
 * Body: {
 *   privyId: string,
 *   publicToken: string,
 *   accountId: string,
 * }
 */
export async function POST(req: Request) {
  try {
    const { privyId, publicToken, accountId } = await req.json();

    if (!privyId || !publicToken || !accountId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyId },
    });

    if (!user?.bridgeCustomerId) {
      return NextResponse.json(
        { error: "No Bridge customer found" },
        { status: 400 }
      );
    }

    // Exchange Plaid token to create external account
    const externalAccount = await exchangePlaidToken({
      customerId: user.bridgeCustomerId,
      publicToken,
      accountId,
    });

    console.log("[Bridge] External account created:", externalAccount.id);

    // Create liquidation address for USDC on Solana
    const liquidationAddress = await createLiquidationAddress({
      customerId: user.bridgeCustomerId,
      externalAccountId: externalAccount.id,
      chain: "solana",
      currency: "usdc",
      destinationCurrency: "usd",
    });

    console.log("[Bridge] Liquidation address created:", liquidationAddress.address);

    // Store in database
    await prisma.user.update({
      where: { privyId },
      data: {
        bridgeExternalAccountId: externalAccount.id,
        bridgeLiquidationAddress: liquidationAddress.address,
      },
    });

    return NextResponse.json({
      success: true,
      externalAccount: {
        id: externalAccount.id,
        bankName: externalAccount.bank_name,
        last4: externalAccount.last_4,
      },
      liquidationAddress: liquidationAddress.address,
    });
  } catch (error: any) {
    console.error("[/api/bridge/bank-account] POST Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to link bank account" },
      { status: 500 }
    );
  }
}
