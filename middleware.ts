import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Restricted countries (US temporarily removed for testing)
const BLOCKED_COUNTRIES = [
  // "US", // United States
  "AF", // Afghanistan
  "DZ", // Algeria
  "AO", // Angola
  "AU", // Australia
  "BY", // Belarus
  "BE", // Belgium
  "BO", // Bolivia
  "BG", // Bulgaria
  "BF", // Burkina Faso
  "CM", // Cameroon
  "CA", // Canada
  "CF", // Central African Republic
  "CI", // Côte d'Ivoire
  "CU", // Cuba
  "CD", // Democratic Republic of the Congo
  "ET", // Ethiopia
  "FR", // France
  "HT", // Haiti
  "IR", // Iran
  "IQ", // Iraq
  "IT", // Italy
  "KE", // Kenya
  "LA", // Laos
  "LB", // Lebanon
  "LY", // Libya
  "ML", // Mali
  "MC", // Monaco
  "MZ", // Mozambique
  "MM", // Myanmar (Burma)
  "NA", // Namibia
  "NI", // Nicaragua
  "NE", // Niger
  "KP", // North Korea
  "CN", // People's Republic of China
  "PL", // Poland
  "RU", // Russia
  "SG", // Singapore
  "SO", // Somalia
  "SS", // South Sudan
  "SD", // Sudan
  "CH", // Switzerland
  "SY", // Syria
  "TW", // Taiwan
  "TH", // Thailand
  "UA", // Ukraine
  "AE", // United Arab Emirates
  "GB", // United Kingdom
  "VE", // Venezuela
  "YE", // Yemen
  "ZW", // Zimbabwe
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
