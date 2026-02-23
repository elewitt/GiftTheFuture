import { NextResponse } from "next/server";
import { createCustomer, getCustomer, getKycLink } from "@/lib/bridge";
import prisma from "@/lib/prisma";

/**
 * POST /api/bridge/customer
 *
 * Create or get a Bridge customer for the current user.
 * Stores the Bridge customer ID in the database.
 *
 * Body: {
 *   email: string,
 *   firstName: string,
 *   lastName: string,
 *   privyId: string,
 * }
 */
export async function POST(req: Request) {
  try {
    const { email, firstName, lastName, privyId } = await req.json();

    if (!email || !privyId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user already has a Bridge customer ID
    const existingUser = await prisma.user.findUnique({
      where: { privyId },
    });

    if (existingUser?.bridgeCustomerId) {
      // Return existing customer
      try {
        const customer = await getCustomer(existingUser.bridgeCustomerId);
        return NextResponse.json({ customer, existing: true });
      } catch {
        // Customer might have been deleted, create new one
      }
    }

    // Create new Bridge customer
    const customer = await createCustomer({
      email,
      firstName: firstName || email.split("@")[0],
      lastName: lastName || "User",
    });

    // Store Bridge customer ID
    await prisma.user.upsert({
      where: { privyId },
      create: {
        privyId,
        email,
        bridgeCustomerId: customer.id,
      },
      update: {
        bridgeCustomerId: customer.id,
      },
    });

    return NextResponse.json({ customer, existing: false });
  } catch (error: any) {
    console.error("[/api/bridge/customer] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create customer" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bridge/customer?privyId=xxx
 *
 * Get Bridge customer status and KYC link if needed.
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
        hasCustomer: false,
        customer: null,
      });
    }

    const customer = await getCustomer(user.bridgeCustomerId);

    // If KYC not complete, get a link
    let kycLink = null;
    if (customer.kyc_status !== "approved") {
      try {
        const kycData = await getKycLink(customer.id);
        kycLink = kycData.url;
      } catch (e) {
        console.error("Failed to get KYC link:", e);
      }
    }

    return NextResponse.json({
      hasCustomer: true,
      customer,
      kycLink,
    });
  } catch (error: any) {
    console.error("[/api/bridge/customer] GET Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get customer" },
      { status: 500 }
    );
  }
}
