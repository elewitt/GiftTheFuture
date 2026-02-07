import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

// USDC on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// USDC on Solana devnet (for testing)
const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    
    const walletPubkey = new PublicKey(address);
    
    // Determine which USDC mint to use based on RPC URL
    const isDevnet = rpcUrl.includes("devnet");
    const usdcMint = new PublicKey(isDevnet ? USDC_MINT_DEVNET : USDC_MINT);

    // Get USDC token account
    const tokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      walletPubkey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let usdcBalance = 0;

    try {
      const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
      usdcBalance = accountInfo.value.uiAmount || 0;
    } catch {
      // Token account doesn't exist = 0 balance
      usdcBalance = 0;
    }

    // Also get SOL balance for gas
    const solBalance = await connection.getBalance(walletPubkey);
    const solBalanceInSol = solBalance / 1e9;

    return NextResponse.json({
      address,
      usdcBalance,
      solBalance: solBalanceInSol,
      network: isDevnet ? "devnet" : "mainnet",
    });
  } catch (error: any) {
    console.error("[/api/wallet/balance] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
