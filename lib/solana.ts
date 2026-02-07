/**
 * Solana Utilities
 *
 * Handles on-chain operations:
 * - Connection management
 * - SPL token transfers (for gift claiming)
 * - Position queries (what tokens does a wallet hold?)
 * - Transaction signing and submission
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SendOptions,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getMarketByMint } from "./dflow";

// ─── Connection ──────────────────────────────────────────────

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl =
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    _connection = new Connection(rpcUrl, "confirmed");
  }
  return _connection;
}

// ─── Server Wallet ───────────────────────────────────────────

let _serverKeypair: Keypair | null = null;

export function getServerKeypair(): Keypair {
  if (!_serverKeypair) {
    const key = process.env.SERVER_WALLET_PRIVATE_KEY;
    if (!key) {
      throw new Error("SERVER_WALLET_PRIVATE_KEY not set in environment");
    }
    const decoded = Buffer.from(key, "base64");
    _serverKeypair = Keypair.fromSecretKey(new Uint8Array(decoded));
  }
  return _serverKeypair;
}

// ─── Sign & Send DFlow Transaction ──────────────────────────

/**
 * Sign a base64-encoded transaction from DFlow and submit it.
 * Handles both legacy and versioned transaction formats.
 */
export async function signAndSendDFlowTransaction(
  base64Transaction: string
): Promise<string> {
  const connection = getConnection();
  const keypair = getServerKeypair();
  const txBuffer = Buffer.from(base64Transaction, "base64");

  // Try versioned first (DFlow typically returns VersionedTransaction)
  try {
    const vtx = VersionedTransaction.deserialize(new Uint8Array(txBuffer));
    vtx.sign([keypair]);

    const signature = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    return signature;
  } catch {
    // Fallback to legacy transaction
    const tx = Transaction.from(txBuffer);
    tx.sign(keypair);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    return signature;
  }
}

/**
 * Wait for a transaction to be confirmed.
 */
export async function confirmTransaction(
  signature: string,
  commitment: "confirmed" | "finalized" = "confirmed"
): Promise<void> {
  const connection = getConnection();
  const latestBlockhash = await connection.getLatestBlockhash();

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment
  );
}

// ─── SPL Token Transfer (Gift Claiming) ─────────────────────

/**
 * Transfer outcome tokens from the server wallet to a recipient.
 * Creates the recipient's Associated Token Account if it doesn't exist.
 *
 * This is the core of the "claim gift" flow:
 * Server wallet holds bought tokens → recipient claims → tokens transfer.
 */
export async function transferOutcomeTokens(params: {
  outcomeMint: string;
  recipientAddress: string;
  amount: number; // In token's smallest unit
}): Promise<string> {
  const connection = getConnection();
  const serverKeypair = getServerKeypair();

  const mintPubkey = new PublicKey(params.outcomeMint);
  const recipientPubkey = new PublicKey(params.recipientAddress);

  // Derive Associated Token Accounts
  const serverATA = getAssociatedTokenAddressSync(
    mintPubkey,
    serverKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const recipientATA = getAssociatedTokenAddressSync(
    mintPubkey,
    recipientPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const tx = new Transaction();

  // Create recipient ATA if it doesn't exist (server pays rent — better UX)
  const recipientATAInfo = await connection.getAccountInfo(recipientATA);
  if (!recipientATAInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        serverKeypair.publicKey, // payer
        recipientATA, // ATA address
        recipientPubkey, // owner
        mintPubkey, // token mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  // Transfer tokens
  tx.add(
    createTransferInstruction(
      serverATA, // from
      recipientATA, // to
      serverKeypair.publicKey, // authority
      params.amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  // Sign and send
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = serverKeypair.publicKey;
  tx.sign(serverKeypair);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await confirmTransaction(signature);

  return signature;
}

// ─── Position Queries ────────────────────────────────────────

export interface Position {
  mint: string;
  balance: number;
  decimals: number;
  market: {
    ticker: string;
    title: string;
    status: string;
  } | null;
  side: "YES" | "NO" | "UNKNOWN";
}

/**
 * Get all prediction market positions for a wallet address.
 *
 * Queries all SPL token accounts, then cross-references each mint
 * with DFlow's Metadata API to identify prediction market tokens.
 */
export async function getPositions(
  walletAddress: string
): Promise<Position[]> {
  const connection = getConnection();
  const pubkey = new PublicKey(walletAddress);

  // Get all token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    pubkey,
    { programId: TOKEN_PROGRAM_ID }
  );

  // Filter to non-zero balances
  const holdings = tokenAccounts.value
    .map((account) => ({
      mint: account.account.data.parsed.info.mint as string,
      balance: account.account.data.parsed.info.tokenAmount.uiAmount as number,
      decimals: account.account.data.parsed.info.tokenAmount
        .decimals as number,
    }))
    .filter((h) => h.balance > 0);

  // Cross-reference with DFlow to find prediction market tokens
  const positions: Position[] = [];

  for (const holding of holdings) {
    const market = await getMarketByMint(holding.mint);

    if (market) {
      const side =
        holding.mint === market.accounts.yesMint
          ? "YES"
          : holding.mint === market.accounts.noMint
            ? "NO"
            : "UNKNOWN";

      positions.push({
        mint: holding.mint,
        balance: holding.balance,
        decimals: holding.decimals,
        market: {
          ticker: market.ticker,
          title: market.title,
          status: market.status,
        },
        side: side as "YES" | "NO" | "UNKNOWN",
      });
    }
  }

  return positions;
}
