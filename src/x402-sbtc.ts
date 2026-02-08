/**
 * x402 Payment Middleware for Hono (supports STX and sBTC)
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
const PAYMENT_AMOUNT_SBTC = "1"; // 1 sat

// sBTC contract
const SBTC_CONTRACT = {
  address: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9",
  name: "token-sbtc",
};

type PaymentTokenType = "STX" | "sBTC";

function getPaymentTokenType(c: Context): PaymentTokenType {
  const queryToken = c.req.query("tokenType");
  const headerToken = c.req.header("X-PAYMENT-TOKEN-TYPE");
  const tokenStr = (headerToken || queryToken || "STX").toUpperCase();
  return tokenStr === "SBTC" ? "sBTC" : "STX";
}

/**
 * Create a standard x402 Payment Required response (supports STX and sBTC)
 */
export function createPaymentRequired(resource: string, c?: Context): object {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const tokenType = c ? getPaymentTokenType(c) : "STX";

  const baseResponse = {
    resource,
    payTo: PAYMENT_ADDRESS,
    network: "mainnet",
    nonce,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };

  if (tokenType === "sBTC") {
    return {
      ...baseResponse,
      maxAmountRequired: PAYMENT_AMOUNT_SBTC,
      tokenType: "sBTC",
      tokenContract: SBTC_CONTRACT,
    };
  }

  return {
    ...baseResponse,
    maxAmountRequired: PAYMENT_AMOUNT,
    tokenType: "STX",
    paymentOptions: {
      stx: { amount: PAYMENT_AMOUNT },
      sbtc: { amount: PAYMENT_AMOUNT_SBTC, tokenContract: SBTC_CONTRACT },
    },
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
 * x402 middleware for STX and sBTC payments
 */
export async function x402SbtcMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  const xPayment = c.req.header("X-Payment");

  if (!xPayment) {
    return c.json(createPaymentRequired(c.req.path, c), 402);
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
