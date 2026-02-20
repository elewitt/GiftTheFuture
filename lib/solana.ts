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
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getMarketByMint } from "./dflow";
import bs58 from "bs58";

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

    // Try to decode as base58 first (common Solana wallet export format)
    // Fall back to base64 if that fails
    let secretKey: Uint8Array;
    try {
      // Check if it looks like a JSON array (e.g., "[1,2,3,...]")
      if (key.startsWith("[")) {
        const parsed = JSON.parse(key);
        secretKey = new Uint8Array(parsed);
      } else {
        // Try base58 first (starts with numbers or letters, 64-88 chars)
        secretKey = bs58.decode(key);
      }
    } catch {
      // Fall back to base64
      secretKey = new Uint8Array(Buffer.from(key, "base64"));
    }

    _serverKeypair = Keypair.fromSecretKey(secretKey);
  }
  return _serverKeypair;
}

// ─── Sign & Send DFlow Transaction ──────────────────────────

/**
 * Sign a base64-encoded transaction from DFlow and submit it.
 * DFlow returns versioned transactions, so we try that first.
 */
export async function signAndSendDFlowTransaction(
  base64Transaction: string
): Promise<string> {
  const connection = getConnection();
  const keypair = getServerKeypair();
  const txBuffer = Buffer.from(base64Transaction, "base64");
  const txBytes = new Uint8Array(txBuffer);

  console.log("[Solana] Transaction buffer length:", txBuffer.length);

  // Try versioned transaction first (DFlow always returns versioned)
  console.log("[Solana] Deserializing as VersionedTransaction...");
  try {
    const vtx = VersionedTransaction.deserialize(txBytes);
    console.log("[Solana] Versioned transaction deserialized successfully");
    console.log("[Solana] Signing with server keypair...");
    vtx.sign([keypair]);

    console.log("[Solana] Sending versioned transaction...");
    const signature = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log("[Solana] ✅ Transaction sent:", signature);
    return signature;
  } catch (versionedErr: any) {
    console.log("[Solana] Versioned failed, trying legacy...", versionedErr.message);

    // Fallback to legacy transaction
    try {
      const tx = Transaction.from(txBuffer);
      tx.sign(keypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      console.log("[Solana] ✅ Legacy transaction sent:", signature);
      return signature;
    } catch (legacyErr: any) {
      console.error("[Solana] Both versioned and legacy failed");
      console.error("[Solana] Versioned error:", versionedErr.message);
      console.error("[Solana] Legacy error:", legacyErr.message);
      throw versionedErr; // Throw the original error
    }
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
 * Detect which token program a mint uses (legacy SPL Token or Token-2022).
 */
async function getTokenProgramForMint(
  connection: Connection,
  mintPubkey: PublicKey
): Promise<PublicKey> {
  const mintInfo = await connection.getAccountInfo(mintPubkey);
  if (!mintInfo) {
    throw new Error(`Mint account not found: ${mintPubkey.toBase58()}`);
  }

  // Check which program owns the mint
  if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Transfer outcome tokens from the server wallet to a recipient.
 * Creates the recipient's Associated Token Account if it doesn't exist.
 * Supports both legacy SPL Token and Token-2022 programs.
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

  // Detect which token program this mint uses
  const tokenProgramId = await getTokenProgramForMint(connection, mintPubkey);
  console.log("[Transfer] Using token program:", tokenProgramId.toBase58());

  // Derive Associated Token Accounts using the correct program
  const serverATA = getAssociatedTokenAddressSync(
    mintPubkey,
    serverKeypair.publicKey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const recipientATA = getAssociatedTokenAddressSync(
    mintPubkey,
    recipientPubkey,
    false,
    tokenProgramId,
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
        tokenProgramId,
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
      tokenProgramId
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

// ─── Token Balance Queries ───────────────────────────────────

/**
 * Get the token balance for a specific mint in a wallet.
 * Returns the raw amount (smallest unit).
 * Supports both legacy SPL Token and Token-2022 programs.
 */
export async function getTokenBalance(
  walletAddress: string,
  mintAddress: string
): Promise<number> {
  const connection = getConnection();
  const walletPubkey = new PublicKey(walletAddress);
  const mintPubkey = new PublicKey(mintAddress);

  // Detect which token program this mint uses
  const tokenProgramId = await getTokenProgramForMint(connection, mintPubkey);

  const ata = getAssociatedTokenAddressSync(
    mintPubkey,
    walletPubkey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  try {
    const account = await getAccount(connection, ata, undefined, tokenProgramId);
    return Number(account.amount);
  } catch {
    // Account doesn't exist or has no balance
    return 0;
  }
}

/**
 * Get the server wallet's balance for a specific token.
 */
export async function getServerTokenBalance(mintAddress: string): Promise<number> {
  const serverKeypair = getServerKeypair();
  return getTokenBalance(serverKeypair.publicKey.toBase58(), mintAddress);
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
 * Queries all SPL token accounts (both legacy and Token-2022),
 * then cross-references each mint with DFlow's Metadata API
 * to identify prediction market tokens.
 */
export async function getPositions(
  walletAddress: string
): Promise<Position[]> {
  const connection = getConnection();
  const pubkey = new PublicKey(walletAddress);

  // Get all token accounts from both programs
  const [legacyAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_PROGRAM_ID,
    }),
    connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  ]);

  // Combine and filter to non-zero balances
  const allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];
  const holdings = allAccounts
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
      // Find which side (YES/NO) this mint represents
      let side: "YES" | "NO" | "UNKNOWN" = "UNKNOWN";
      for (const collateral of Object.values(market.accounts)) {
        if (holding.mint === collateral.yesMint) {
          side = "YES";
          break;
        } else if (holding.mint === collateral.noMint) {
          side = "NO";
          break;
        }
      }

      positions.push({
        mint: holding.mint,
        balance: holding.balance,
        decimals: holding.decimals,
        market: {
          ticker: market.ticker,
          title: market.title,
          status: market.status,
        },
        side,
      });
    }
  }

  return positions;
}
