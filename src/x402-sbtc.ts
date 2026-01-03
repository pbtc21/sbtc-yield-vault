/**
 * x402 sBTC Payment Middleware for Hono
 * Broadcasts signed transactions directly to Stacks network
 */
import type { Context, Next } from "hono";
import type { Env, Variables } from "./types";
import {
  getDefaultSBTCContract,
  createExpirationTimestamp,
  BTCtoSats,
  satsToBTC,
} from "x402-stacks";
import type {
  X402PaymentRequired,
  NetworkType,
} from "x402-stacks";
import {
  deserializeTransaction,
  broadcastTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

// Vault operator address (receives payments)
// Using stx402 registry address for testing - change to your vault address in production
const VAULT_ADDRESS = "SP31JEZWX4S131326VKM05QKJ0TDGNVVE0CDWWVA2";

// Network configuration
const NETWORK: NetworkType = "mainnet";

// sBTC token contract
const SBTC_CONTRACT = getDefaultSBTCContract(NETWORK);

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Generate a unique nonce for payment request
 */
function generateNonce(): string {
  return `vault-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a proper x402 Payment Required response
 * Note: Using STX for payments since x402-stacks has outdated sBTC contract
 * TODO: Switch to sBTC when x402-stacks is updated with correct contract
 */
export function createPaymentRequired(
  amount: string,
  resource: string,
  memo?: string,
  tokenType: "STX" | "sBTC" = "STX"
): X402PaymentRequired {
  const response: X402PaymentRequired = {
    maxAmountRequired: amount,
    resource,
    payTo: VAULT_ADDRESS,
    network: NETWORK,
    nonce: generateNonce(),
    expiresAt: createExpirationTimestamp(300), // 5 minutes
    memo,
    tokenType,
  };

  if (tokenType === "sBTC") {
    // Use correct mainnet sBTC contract
    response.tokenContract = {
      address: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
      name: "sbtc-token",
    };
  }

  return response;
}

/**
 * x402 middleware for sBTC payments using the facilitator pattern
 *
 * Flow:
 * 1. Client makes request without payment
 * 2. Server returns 402 with X402PaymentRequired body
 * 3. Client signs transaction and retries with X-PAYMENT header
 * 4. Server settles payment via facilitator and grants access
 */
export async function x402SbtcMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  // Check for signed payment in X-PAYMENT header
  const xPayment = c.req.header("X-PAYMENT");

  if (!xPayment) {
    // No payment provided - return 402 Payment Required
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const amount = (body?.amount as string) || "1000"; // Default 1000 sats
    const resource = c.req.path;

    const paymentRequired = createPaymentRequired(
      amount,
      resource,
      "vault-deposit"
    );

    // Set x402 response headers
    c.header("X-Payment-Required", "true");
    c.header("X-Payment-Network", NETWORK);
    c.header("X-Payment-Token", "sBTC");

    return c.json(paymentRequired, 402);
  }

  // Payment provided - broadcast and verify directly
  try {
    // Parse the request body to get expected amount
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const expectedAmount = BigInt((body?.amount as string) || "1000");

    // Deserialize the signed transaction
    const txBytes = hexToBytes(xPayment);
    const transaction = deserializeTransaction(txBytes);

    // Broadcast the transaction to Stacks network
    const broadcastResult = await broadcastTransaction({
      transaction,
      network: STACKS_MAINNET,
    });

    if ("error" in broadcastResult) {
      return c.json(
        {
          error: "Transaction broadcast failed",
          details: broadcastResult.error,
          reason: broadcastResult.reason,
        },
        400
      );
    }

    const txId = broadcastResult.txid;

    // Store payment info for handler to use
    // Note: Transaction is now pending, not confirmed
    c.set("payment", {
      txId,
      sender: (body?.sender as string) || "unknown",
      amount: expectedAmount.toString(),
      status: "pending",
    });

    // Set response header with payment confirmation
    c.header(
      "X-PAYMENT-RESPONSE",
      JSON.stringify({
        txId,
        status: "pending",
        message: "Transaction broadcast successfully, awaiting confirmation",
      })
    );

    // Payment broadcast - continue to handler
    await next();
  } catch (error) {
    console.error("Payment processing error:", error);

    return c.json(
      {
        error: "Payment processing failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      400
    );
  }
}

/**
 * Simple payment gate for endpoints that don't need full deposit flow
 * Use for API access payments (not vault deposits)
 */
export function createPaymentGate(amountSats: number, resource?: string) {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const xPayment = c.req.header("X-PAYMENT");

    if (!xPayment) {
      const paymentRequired = createPaymentRequired(
        amountSats.toString(),
        resource || c.req.path,
        "api-access"
      );
      return c.json(paymentRequired, 402);
    }

    try {
      // Deserialize and broadcast the signed transaction
      const txBytes = hexToBytes(xPayment);
      const transaction = deserializeTransaction(txBytes);

      const broadcastResult = await broadcastTransaction({
        transaction,
        network: STACKS_MAINNET,
      });

      if ("error" in broadcastResult) {
        return c.json({ error: "Broadcast failed", details: broadcastResult.error }, 400);
      }

      c.set("payment", {
        txId: broadcastResult.txid,
        sender: "pending",
        amount: amountSats.toString(),
        status: "pending",
      });
      await next();
    } catch (error) {
      return c.json({ error: "Payment failed" }, 400);
    }
  };
}

/**
 * Verify an existing sBTC payment on-chain (for manual verification)
 */
export async function verifySbtcPayment(
  txId: string,
  expectedRecipient: string
): Promise<{ valid: boolean; status: string; error?: string }> {
  try {
    const response = await fetch(
      `https://api.mainnet.hiro.so/extended/v1/tx/${txId}`
    );

    if (!response.ok) {
      return { valid: false, status: "not_found", error: "Transaction not found" };
    }

    const tx = await response.json() as { tx_status: string; token_transfer?: { recipient_address: string } };

    if (tx.tx_status === "success") {
      if (tx.token_transfer?.recipient_address === expectedRecipient) {
        return { valid: true, status: "success" };
      }
      return { valid: false, status: "success", error: "Wrong recipient" };
    }

    return { valid: false, status: tx.tx_status };
  } catch (error) {
    return { valid: false, status: "error", error: "Verification failed" };
  }
}

/**
 * Helper to convert BTC to sats for pricing
 */
export { BTCtoSats, satsToBTC };
