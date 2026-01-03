/**
 * x402 sBTC Payment Middleware for Hono
 * Implements the x402 facilitator pattern: client signs, server settles
 */
import type { Context, Next } from "hono";
import type { Env, Variables } from "./types";
import {
  X402PaymentVerifier,
  getDefaultSBTCContract,
  createExpirationTimestamp,
  BTCtoSats,
  satsToBTC,
} from "x402-stacks";
import type {
  X402PaymentRequired,
  VerifiedPayment,
  NetworkType,
} from "x402-stacks";

// Vault operator address (receives sBTC payments)
const VAULT_ADDRESS = "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA";

// Network configuration
const NETWORK: NetworkType = "mainnet";

// sBTC token contract
const SBTC_CONTRACT = getDefaultSBTCContract(NETWORK);

// Facilitator URL for payment settlement
const FACILITATOR_URL = "https://x402.org/api/facilitator";

// Payment verifier instance
const verifier = new X402PaymentVerifier(FACILITATOR_URL, NETWORK);

/**
 * Generate a unique nonce for payment request
 */
function generateNonce(): string {
  return `vault-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a proper x402 Payment Required response
 */
export function createPaymentRequired(
  amount: string,
  resource: string,
  memo?: string
): X402PaymentRequired {
  return {
    maxAmountRequired: amount,
    resource,
    payTo: VAULT_ADDRESS,
    network: NETWORK,
    nonce: generateNonce(),
    expiresAt: createExpirationTimestamp(300), // 5 minutes
    memo,
    tokenType: "sBTC",
    tokenContract: SBTC_CONTRACT,
  };
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

  // Payment provided - verify and settle via facilitator
  try {
    // Parse the request body to get expected amount
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const expectedAmount = BigInt((body?.amount as string) || "1000");

    // Settle the payment via facilitator
    // The facilitator will broadcast the signed transaction and wait for confirmation
    const payment: VerifiedPayment = await verifier.settlePayment(xPayment, {
      expectedRecipient: VAULT_ADDRESS,
      minAmount: expectedAmount,
      tokenType: "sBTC",
      resource: c.req.path,
      method: c.req.method,
    });

    if (!payment.isValid) {
      return c.json(
        {
          error: "Payment verification failed",
          details: payment.validationError,
        },
        402
      );
    }

    // Store payment info for handler to use
    c.set("payment", {
      txId: payment.txId,
      sender: payment.sender,
      amount: payment.amount.toString(),
      status: payment.status,
    });

    // Set response header with payment confirmation
    c.header(
      "X-PAYMENT-RESPONSE",
      JSON.stringify({
        txId: payment.txId,
        status: payment.status,
        blockHeight: payment.blockHeight,
      })
    );

    // Payment verified - continue to handler
    await next();
  } catch (error) {
    console.error("Payment settlement error:", error);

    // Check if it's a facilitator error
    if (error instanceof Error) {
      // If facilitator is unavailable, fall back to direct verification
      if (
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        return c.json(
          {
            error: "Payment facilitator unavailable",
            message: "Please try again later",
          },
          503
        );
      }
    }

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
      const payment = await verifier.settlePayment(xPayment, {
        expectedRecipient: VAULT_ADDRESS,
        minAmount: BigInt(amountSats),
        tokenType: "sBTC",
        resource: resource || c.req.path,
        method: c.req.method,
      });

      if (!payment.isValid) {
        return c.json({ error: "Invalid payment" }, 402);
      }

      c.set("payment", {
        txId: payment.txId,
        sender: payment.sender,
        amount: payment.amount.toString(),
        status: payment.status,
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
  expectedAmount: string,
  expectedRecipient: string
): Promise<VerifiedPayment> {
  return verifier.verifyPayment(txId, {
    expectedRecipient,
    minAmount: BigInt(expectedAmount),
    tokenType: "sBTC",
  });
}

/**
 * Helper to convert BTC to sats for pricing
 */
export { BTCtoSats, satsToBTC };
