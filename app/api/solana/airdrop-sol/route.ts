import { NextResponse } from "next/server";
import {
  Keypair,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

const FEE_PAYER_PRIVATE_KEY = process.env.SOLANA_FEE_PAYER_PRIVATE_KEY;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Amount of SOL to airdrop (0.005 SOL = ~5000 lamports, enough for several transactions)
const AIRDROP_AMOUNT = 0.005 * LAMPORTS_PER_SOL;

// Minimum SOL balance before we airdrop
const MIN_BALANCE = 0.002 * LAMPORTS_PER_SOL;

// Handle both old and new bs58 API
const bs58Decode = (str: string): Uint8Array => {
  if (typeof bs58.decode === "function") {
    return bs58.decode(str);
  }
  return (bs58 as any).default.decode(str);
};

/**
 * POST /api/solana/airdrop-sol
 *
 * Sends a small amount of SOL to a user wallet so they can pay transaction fees.
 * Only sends if the user's balance is below the minimum threshold.
 *
 * Body: {
 *   userAddress: string
 * }
 */
export async function POST(req: Request) {
  try {
    if (!FEE_PAYER_PRIVATE_KEY) {
      console.error("[Airdrop] Missing SOLANA_FEE_PAYER_PRIVATE_KEY");
      return NextResponse.json(
        { error: "Airdrop not configured" },
        { status: 500 }
      );
    }

    const { userAddress } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing userAddress" },
        { status: 400 }
      );
    }

    let userPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(userAddress);
    } catch {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const connection = new Connection(RPC_URL, "confirmed");

    // Check user's current SOL balance
    const balance = await connection.getBalance(userPubkey);
    console.log("[Airdrop] User balance:", balance, "lamports");

    if (balance >= MIN_BALANCE) {
      console.log("[Airdrop] User has enough SOL, skipping airdrop");
      return NextResponse.json({
        success: true,
        skipped: true,
        balance: balance / LAMPORTS_PER_SOL,
        message: "User already has enough SOL",
      });
    }

    // Decode the fee payer wallet
    const feePayerWallet = Keypair.fromSecretKey(bs58Decode(FEE_PAYER_PRIVATE_KEY));

    // Create transfer transaction
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: feePayerWallet.publicKey,
        toPubkey: userPubkey,
        lamports: AIRDROP_AMOUNT,
      })
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayerWallet.publicKey;

    // Sign and send
    tx.sign(feePayerWallet);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log("[Airdrop] Transaction sent:", signature);

    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    console.log("[Airdrop] SOL sent to", userAddress, "amount:", AIRDROP_AMOUNT / LAMPORTS_PER_SOL, "SOL");

    return NextResponse.json({
      success: true,
      signature,
      amount: AIRDROP_AMOUNT / LAMPORTS_PER_SOL,
    });
  } catch (error: any) {
    console.error("[/api/solana/airdrop-sol] Error:", error);

    let errorMessage = error.message || "Airdrop failed";

    if (errorMessage.includes("insufficient funds") || errorMessage.includes("Insufficient")) {
      errorMessage = "Fee payer wallet needs more SOL. Please contact support.";
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
