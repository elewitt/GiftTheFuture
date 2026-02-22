import { NextResponse } from "next/server";
import { createRedemptionOrder, getMarketByMint } from "@/lib/dflow";
import { getTokenBalance } from "@/lib/solana";
import {
  VersionedTransaction,
  TransactionMessage,
  PublicKey,
  Connection,
  Keypair,
} from "@solana/web3.js";
import bs58 from "bs58";

const FEE_PAYER_PRIVATE_KEY = process.env.SOLANA_FEE_PAYER_PRIVATE_KEY;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/**
 * POST /api/gift/redeem
 *
 * Returns an unsigned transaction for selling outcome tokens.
 * If gas sponsorship is enabled, the transaction is rebuilt with our fee payer.
 *
 * Body: {
 *   outcomeMint: string,
 *   amount: number,
 *   userPublicKey: string,  // Recipient's wallet address
 *   sponsored?: boolean,    // Whether to use gas sponsorship
 * }
 */
export async function POST(req: Request) {
  try {
    const { outcomeMint, amount, userPublicKey, sponsored } = await req.json();

    console.log("[/api/gift/redeem] Request:", { outcomeMint, amount, userPublicKey });

    if (!outcomeMint || !amount || !userPublicKey) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user actually has the tokens
    const balance = await getTokenBalance(userPublicKey, outcomeMint);
    console.log("[/api/gift/redeem] User token balance:", balance, "requested:", amount);

    if (balance <= 0) {
      return NextResponse.json(
        { error: "No tokens found in your wallet. The claim may not have completed successfully." },
        { status: 400 }
      );
    }

    if (balance < amount) {
      return NextResponse.json(
        { error: `Insufficient balance. You have ${balance} tokens but tried to sell ${amount}.` },
        { status: 400 }
      );
    }

    // Check if the market is still active
    const market = await getMarketByMint(outcomeMint);
    console.log("[/api/gift/redeem] Market lookup:", market);

    if (market && market.status !== "active" && market.status !== "open") {
      return NextResponse.json(
        { error: `Market is ${market.status}. Cashout is only available for active markets.` },
        { status: 400 }
      );
    }

    // Get redemption order from DFlow
    // This sells outcome tokens → USDC
    const order = await createRedemptionOrder({
      outcomeMint,
      amount,
      userPublicKey,
    });

    console.log("[/api/gift/redeem] Order created:", {
      executionMode: order.executionMode,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
    });

    let finalTransaction = order.transaction;
    let isSponsored = false;

    // If gas sponsorship is requested and configured, rebuild transaction with our fee payer
    if (sponsored && FEE_PAYER_PRIVATE_KEY) {
      try {
        const feePayerWallet = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_PRIVATE_KEY));
        const feePayerPubkey = feePayerWallet.publicKey;

        // Deserialize the original transaction
        const txBuffer = Buffer.from(order.transaction, "base64");
        const originalTx = VersionedTransaction.deserialize(new Uint8Array(txBuffer));

        // Get a fresh blockhash
        const connection = new Connection(RPC_URL, "confirmed");
        const { blockhash } = await connection.getLatestBlockhash();

        // Decompile the message to get instructions
        const message = originalTx.message;
        const accountKeys = message.staticAccountKeys;

        // Extract instructions from the versioned transaction
        const compiledInstructions = message.compiledInstructions;

        // Build new instructions with the original account keys
        const instructions = compiledInstructions.map((ix) => {
          const programId = accountKeys[ix.programIdIndex];
          const keys = ix.accountKeyIndexes.map((idx) => ({
            pubkey: accountKeys[idx],
            isSigner: message.isAccountSigner(idx),
            isWritable: message.isAccountWritable(idx),
          }));
          return {
            programId,
            keys,
            data: Buffer.from(ix.data),
          };
        });

        // Rebuild the transaction message with our fee payer
        const newMessage = new TransactionMessage({
          payerKey: feePayerPubkey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message();

        const newTx = new VersionedTransaction(newMessage);
        finalTransaction = Buffer.from(newTx.serialize()).toString("base64");
        isSponsored = true;

        console.log("[/api/gift/redeem] Transaction rebuilt with fee payer:", feePayerPubkey.toBase58());
      } catch (rebuildErr: any) {
        console.error("[/api/gift/redeem] Failed to rebuild transaction for sponsorship:", rebuildErr);
        // Fall back to original transaction
      }
    }

    return NextResponse.json({
      transaction: finalTransaction,
      executionMode: order.executionMode,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
      minOutAmount: order.minOutAmount,
      sponsored: isSponsored,
      feePayerAddress: isSponsored && FEE_PAYER_PRIVATE_KEY
        ? Keypair.fromSecretKey(bs58.decode(FEE_PAYER_PRIVATE_KEY)).publicKey.toBase58()
        : null,
    });
  } catch (error: any) {
    console.error("[/api/gift/redeem] Error:", error.message);

    // Provide more helpful error messages
    if (error.message?.includes("route_not_found")) {
      return NextResponse.json(
        { error: "No liquidity available. The market may be closed or have insufficient trading volume." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Redemption failed" },
      { status: 500 }
    );
  }
}
