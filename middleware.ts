import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// OFAC sanctioned countries + United States
const BLOCKED_COUNTRIES = [
  "US", // United States
  "IR", // Iran
  "KP", // North Korea
  "CU", // Cuba
  "SY", // Syria
  "RU", // Russia
  "BY", // Belarus
];

export function middleware(request: NextRequest) {
  // Vercel provides geo data via headers
  const country = request.headers.get("x-vercel-ip-country");

  // Allow requests without geo data (localhost, etc.) in development
  if (!country && process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  // Block restricted countries
  if (country && BLOCKED_COUNTRIES.includes(country)) {
    // Allow access to the blocked page itself and static assets
    const pathname = request.nextUrl.pathname;
    if (pathname === "/blocked" || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
      return NextResponse.next();
    }

    return NextResponse.rewrite(new URL("/blocked", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
