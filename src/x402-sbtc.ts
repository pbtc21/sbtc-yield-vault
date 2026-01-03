import type { Context, Next } from "hono";
import type { Env, PaymentInfo } from "./types";

// sBTC contract address
const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

// Vault operator address (receives sBTC payments)
const VAULT_ADDRESS = "SPFE9JKCZ4XV35YND18FXCFT2Q32FHPVYKHNHYAF";

export function createPaymentResponse(amount: string, memo: string): { error: string; payment: PaymentInfo } {
  return {
    error: "Payment Required",
    payment: {
      amount,
      token: "sBTC",
      address: VAULT_ADDRESS,
      memo,
      network: "mainnet",
    },
  };
}

// x402 middleware for sBTC payments
export async function x402SbtcMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const paymentProof = c.req.header("X-Payment-Proof");

  if (!paymentProof) {
    // Return 402 with payment instructions
    // For deposit, the payment IS the deposit amount
    const body = await c.req.json().catch(() => ({}));
    const amount = (body as any)?.amount || "1000"; // Default 1000 sats minimum

    return c.json(createPaymentResponse(amount, "vault-deposit"), 402);
  }

  // v1: Accept any non-empty proof (mock validation)
  // v2: Verify sBTC transaction on-chain via Stacks API
  if (paymentProof.length < 10) {
    return c.json({ error: "Invalid payment proof" }, 400);
  }

  // Payment proof validated, continue to handler
  await next();
}

// Verify sBTC payment on-chain (v2 implementation)
export async function verifySbtcPayment(
  txId: string,
  expectedAmount: string,
  expectedRecipient: string
): Promise<{ valid: boolean; amount?: string; sender?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://api.mainnet.hiro.so/extended/v1/tx/${txId}`
    );

    if (!response.ok) {
      return { valid: false, error: "Transaction not found" };
    }

    const tx = await response.json() as any;

    // Check if it's a successful token transfer
    if (tx.tx_status !== "success") {
      return { valid: false, error: "Transaction not confirmed" };
    }

    // Find sBTC transfer event
    const sbtcTransfer = tx.events?.find(
      (e: any) =>
        e.event_type === "fungible_token_asset" &&
        e.asset?.asset_id?.includes("sbtc")
    );

    if (!sbtcTransfer) {
      return { valid: false, error: "No sBTC transfer found" };
    }

    const amount = sbtcTransfer.asset.amount;
    const recipient = sbtcTransfer.asset.recipient;
    const sender = sbtcTransfer.asset.sender;

    // Verify recipient and amount
    if (recipient !== expectedRecipient) {
      return { valid: false, error: "Wrong recipient" };
    }

    if (BigInt(amount) < BigInt(expectedAmount)) {
      return { valid: false, error: "Insufficient amount" };
    }

    return { valid: true, amount, sender };
  } catch (error) {
    return { valid: false, error: "Verification failed" };
  }
}
