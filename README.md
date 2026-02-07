# FutureGift

Gift tokenized prediction market positions on Solana. Powered by Privy, DFlow, and Kalshi.

## Architecture

```
Gifter → FutureGift App → DFlow Trade API → SPL Token Minted
                                                    ↓
Recipient ← Claim Link ← SMS/Email     ←  Token transferred
    ↓                                     to Privy wallet
  Privy Auth (email/phone/social)
    ↓
  Hold position or Cash Out via DFlow
```

## Stack

- **Next.js 15** (App Router) — Frontend + API routes
- **Privy** — Auth + embedded Solana wallets
- **DFlow** — Prediction market trading (Kalshi tokenization layer)
- **Solana** — On-chain settlement, SPL token transfers
- **Vercel** — Deployment

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.local` and fill in your keys:

```env
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
DFLOW_API_KEY=your-dflow-api-key
SOLANA_RPC_URL=https://api.devnet.solana.com
SERVER_WALLET_PRIVATE_KEY=base64-encoded-keypair
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Getting your keys:**

- **Privy**: Create an app at [console.privy.io](https://console.privy.io). Enable Solana embedded wallets. Add `http://localhost:3000` to allowed origins.
- **DFlow**: Email [email protected] to request an API key. During development, endpoints work without a key (rate limited).
- **Server Wallet**: Generate with `solana-keygen new --outfile server-wallet.json`, then `cat server-wallet.json | base64` for the env var. Fund with devnet SOL and USDC for testing.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Test the flow

1. **Browse markets** — Homepage pulls live Kalshi markets from DFlow
2. **Sign in** — Click "Sign In" to test Privy auth (creates embedded wallet)
3. **Gift page** — Visit `/gift/test-id` to see the claim flow
4. **Dashboard** — Visit `/dashboard` to see position tracking

## Project Structure

```
futuregift/
├── app/
│   ├── layout.tsx          # Root layout + metadata
│   ├── providers.tsx       # Privy provider config
│   ├── globals.css         # Global styles + Tailwind
│   ├── page.tsx            # Home — market browser
│   ├── dashboard/
│   │   └── page.tsx        # User's positions
│   ├── gift/
│   │   └── [id]/
│   │       └── page.tsx    # Gift claim page (recipient lands here)
│   └── api/
│       ├── markets/
│       │   └── route.ts    # GET: fetch markets from DFlow
│       └── gift/
│           ├── create/
│           │   └── route.ts # POST: buy position + create gift
│           ├── claim/
│           │   └── route.ts # POST: transfer tokens to recipient
│           └── redeem/
│               └── route.ts # POST: cash out position
├── lib/
│   ├── dflow.ts            # DFlow API client (metadata + trade + WS)
│   ├── solana.ts           # Solana utils (connection, transfers, queries)
│   └── gifts.ts            # Gift store (in-memory, swap for DB)
├── components/             # Shared UI components (add as needed)
├── .env.local              # Environment variables (not committed)
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/markets` | GET | Fetch live Kalshi markets via DFlow |
| `/api/gift/create` | POST | Buy outcome tokens + create gift |
| `/api/gift/claim` | GET | Get gift details for claim page |
| `/api/gift/claim` | POST | Transfer tokens to recipient |
| `/api/gift/redeem` | POST | Get cash-out transaction (recipient signs) |

## Next Steps

- [ ] Add Prisma + Postgres for persistent gift storage
- [ ] Wire up Twilio SMS / SendGrid email for claim notifications
- [ ] Add gift builder UI (market detail → checkout flow)
- [ ] Implement position tracking with DFlow WebSocket prices
- [ ] Apply for Kalshi Builder Code (earn fees on volume)
- [ ] Apply for Kalshi $2M+ builder grants program
- [ ] Add KYC flow for production compliance
- [ ] Deploy to Vercel

## Kalshi Builder Program

Kalshi is funding apps built on DFlow with $2M+ in grants.
FutureGift's gifting use case is a strong fit. See: https://news.kalshi.com

## License

MIT
