import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/users/check-username?username=xxx
 *
 * Check if a username is available.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    // Validate format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json({ available: false, reason: "Invalid format" });
    }

    // Check if taken
    const existingUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });

    return NextResponse.json({
      available: !existingUser,
      username: username.toLowerCase(),
    });
  } catch (error: any) {
    console.error("[/api/users/check-username] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check username" },
      { status: 500 }
    );
  }
}
