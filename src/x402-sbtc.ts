/**
 * x402 STX Payment Middleware for Hono
 * Broadcasts signed transactions directly to Stacks network
 */
import type { Context, Next } from "hono";
import type { Env, Variables } from "./types";
import {
  deserializeTransaction,
  broadcastTransaction,
} from "@stacks/transactions";

// Payment configuration
const PAYMENT_ADDRESS = "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA";
const PAYMENT_AMOUNT = "1000"; // 0.001 STX

/**
 * Create a standard x402 Payment Required response
 */
export function createPaymentRequired(resource: string): object {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return {
    maxAmountRequired: PAYMENT_AMOUNT,
    resource,
    payTo: PAYMENT_ADDRESS,
    network: "mainnet",
    nonce,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    tokenType: "STX",
  };
}

/**
 * Verify and broadcast payment transaction
 */
async function verifyAndBroadcastPayment(
  rawTxHex: string,
  minAmount: number
): Promise<{ success: boolean; txid?: string; error?: string }> {
  try {
    const tx = deserializeTransaction(rawTxHex);

    if (tx.payload.payloadType !== 0) {
      return { success: false, error: "Transaction is not a STX transfer" };
    }

    const payload = tx.payload as any;
    const amount = Number(payload.amount);

    if (amount < minAmount) {
      return { success: false, error: `Insufficient payment: got ${amount}, need ${minAmount}` };
    }

    const broadcastResult = await broadcastTransaction({
      transaction: tx,
      network: "mainnet",
    });

    if ("error" in broadcastResult) {
      return { success: false, error: `Broadcast failed: ${broadcastResult.error}` };
    }

    return { success: true, txid: broadcastResult.txid };
  } catch (error: any) {
    return { success: false, error: `Payment verification failed: ${error.message}` };
  }
}

/**
 * x402 middleware for STX payments
 */
export async function x402SbtcMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  const xPayment = c.req.header("X-Payment");

  if (!xPayment) {
    return c.json(createPaymentRequired(c.req.path), 402);
  }

  const result = await verifyAndBroadcastPayment(xPayment, parseInt(PAYMENT_AMOUNT));

  if (!result.success) {
    return c.json({
      error: "Payment verification failed",
      details: result.error,
    }, 402);
  }

  // Store payment info for handler
  c.set("payment", {
    txId: result.txid,
    amount: PAYMENT_AMOUNT,
    status: "broadcast",
  });

  await next();
}
