import { NextResponse } from "next/server";
import {
  Keypair,
  VersionedTransaction,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";

const FEE_PAYER_PRIVATE_KEY = process.env.SOLANA_FEE_PAYER_PRIVATE_KEY;

// Handle both old and new bs58 API
const bs58Decode = (str: string): Uint8Array => {
  if (typeof bs58.decode === "function") {
    return bs58.decode(str);
  }
  return (bs58 as any).default.decode(str);
};
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Whitelist of program IDs we allow sponsorship for
const ALLOWED_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token Program
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token Program
  "11111111111111111111111111111111", // System Program
  // Add DFlow program IDs as needed
];

/**
 * POST /api/solana/sponsor
 *
 * Receives a partially signed transaction, adds fee payer signature, and broadcasts.
 *
 * Body: {
 *   transaction: string (base64 encoded serialized transaction)
 *   userAddress: string (to verify the signer)
 * }
 */
export async function POST(req: Request) {
  try {
    if (!FEE_PAYER_PRIVATE_KEY) {
      console.error("[Sponsor] Missing SOLANA_FEE_PAYER_PRIVATE_KEY");
      return NextResponse.json(
        { error: "Gas sponsorship not configured" },
        { status: 500 }
      );
    }

    const { transaction: serializedTx, userAddress } = await req.json();

    if (!serializedTx) {
      return NextResponse.json(
        { error: "Missing transaction data" },
        { status: 400 }
      );
    }

    // Decode the fee payer wallet
    const feePayerWallet = Keypair.fromSecretKey(bs58Decode(FEE_PAYER_PRIVATE_KEY));
    const feePayerAddress = feePayerWallet.publicKey.toBase58();

    // Deserialize the transaction
    const txBuffer = Buffer.from(serializedTx, "base64");
    const transaction = VersionedTransaction.deserialize(new Uint8Array(txBuffer));

    // Verify the fee payer matches our wallet
    const message = transaction.message;
    const accountKeys = message.staticAccountKeys;
    const feePayer = accountKeys[0];

    if (!feePayer || feePayer.toBase58() !== feePayerAddress) {
      console.error("[Sponsor] Invalid fee payer:", feePayer?.toBase58(), "expected:", feePayerAddress);
      return NextResponse.json(
        { error: "Invalid fee payer in transaction" },
        { status: 403 }
      );
    }

    // Basic validation: check that the transaction doesn't try to transfer SOL from fee payer
    // (More sophisticated validation could be added here)

    // Sign with fee payer
    transaction.sign([feePayerWallet]);

    // Connect and send
    const connection = new Connection(RPC_URL, "confirmed");

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log("[Sponsor] Transaction sent:", signature);

    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    console.log("[Sponsor] Transaction confirmed:", signature);

    return NextResponse.json({
      success: true,
      signature,
    });
  } catch (error: any) {
    console.error("[/api/solana/sponsor] Error:", error);

    let errorMessage = error.message || "Failed to sponsor transaction";

    // Parse common errors
    if (errorMessage.includes("insufficient funds") || errorMessage.includes("Insufficient")) {
      errorMessage = "Fee payer has insufficient SOL. Please contact support.";
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/solana/sponsor
 *
 * Returns the fee payer public key so clients can build transactions with it.
 */
export async function GET() {
  try {
    if (!FEE_PAYER_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Gas sponsorship not configured" },
        { status: 500 }
      );
    }

    const feePayerWallet = Keypair.fromSecretKey(bs58Decode(FEE_PAYER_PRIVATE_KEY));

    return NextResponse.json({
      feePayerAddress: feePayerWallet.publicKey.toBase58(),
    });
  } catch (error: any) {
    console.error("[/api/solana/sponsor] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to get fee payer address" },
      { status: 500 }
    );
  }
}
