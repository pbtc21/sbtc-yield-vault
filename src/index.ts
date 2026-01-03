import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { x402SbtcMiddleware, createPaymentResponse } from "./x402-sbtc";
import {
  getVaultStats,
  getUserPosition,
  buildDepositTransaction,
  buildWithdrawTransaction,
  satsToBtc,
} from "./vault";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use("*", cors());

// ============================================
// PUBLIC ENDPOINTS (No payment required)
// ============================================

// Root - API info
app.get("/", (c) => {
  return c.json({
    service: "sBTC Yield Vault",
    version: "1.0.0",
    description: "Leveraged yield vault using sBTC looping strategy on Zest Protocol",
    endpoints: {
      "GET /": "API info",
      "GET /stats": "Vault statistics",
      "GET /position/:address": "User position",
      "POST /deposit": "Deposit sBTC (x402 gated)",
      "POST /withdraw": "Withdraw sBTC + yield",
    },
    config: {
      strategy: "3-loop sBTC leverage on Zest",
      estimatedApy: "~11% net",
      managementFee: "10%",
      tvlCap: "1 BTC",
    },
  });
});

// Vault stats
app.get("/stats", async (c) => {
  const stats = await getVaultStats();

  return c.json({
    ...stats,
    totalAssetsBtc: satsToBtc(stats.totalAssets),
    tvlCapBtc: satsToBtc(stats.tvlCap),
    tvlRemainingBtc: satsToBtc(stats.tvlRemaining),
  });
});

// User position
app.get("/position/:address", async (c) => {
  const address = c.req.param("address");

  if (!address || !address.startsWith("SP")) {
    return c.json({ error: "Invalid Stacks address" }, 400);
  }

  const position = await getUserPosition(address);

  return c.json({
    ...position,
    assetsBtc: satsToBtc(position.assets),
    depositedBtc: satsToBtc(position.deposited),
    profitBtc: satsToBtc(position.profit),
  });
});

// ============================================
// PROTECTED ENDPOINTS (x402 payment required)
// ============================================

// Deposit sBTC
app.post("/deposit", x402SbtcMiddleware, async (c) => {
  const body = await c.req.json<{ amount: string; sender: string }>();

  // Validate input
  if (!body.amount || !body.sender) {
    return c.json({ error: "amount and sender are required" }, 400);
  }

  const amount = BigInt(body.amount);
  if (amount <= 0n) {
    return c.json({ error: "amount must be positive" }, 400);
  }

  // Check TVL cap
  const stats = await getVaultStats();
  const remaining = BigInt(stats.tvlRemaining);

  if (amount > remaining) {
    return c.json({
      error: "Deposit exceeds TVL cap",
      maxDeposit: stats.tvlRemaining,
      maxDepositBtc: satsToBtc(stats.tvlRemaining),
    }, 400);
  }

  // Build transaction for user to sign
  const tx = buildDepositTransaction(body.amount, body.sender);

  // Calculate expected shares
  const sharePrice = BigInt(stats.sharePrice);
  const expectedShares = (amount * 100000000n) / sharePrice;

  return c.json({
    message: "Deposit transaction ready",
    transaction: tx,
    deposit: {
      amount: body.amount,
      amountBtc: satsToBtc(body.amount),
      expectedShares: expectedShares.toString(),
      currentSharePrice: stats.sharePrice,
    },
    instructions: "Sign and broadcast this transaction with your Stacks wallet",
  });
});

// Withdraw sBTC
app.post("/withdraw", async (c) => {
  const body = await c.req.json<{ shares: string; sender: string; minReceive?: string }>();

  // Validate input
  if (!body.shares || !body.sender) {
    return c.json({ error: "shares and sender are required" }, 400);
  }

  const shares = BigInt(body.shares);
  if (shares <= 0n) {
    return c.json({ error: "shares must be positive" }, 400);
  }

  // Get current stats
  const stats = await getVaultStats();
  const sharePrice = BigInt(stats.sharePrice);

  // Calculate expected assets
  const expectedAssets = (shares * sharePrice) / 100000000n;

  // Apply minimum receive (slippage protection)
  const minReceive = body.minReceive || ((expectedAssets * 99n) / 100n).toString(); // 1% slippage default

  // Build transaction
  const tx = buildWithdrawTransaction(body.shares, body.sender, minReceive);

  return c.json({
    message: "Withdraw transaction ready",
    transaction: tx,
    withdraw: {
      shares: body.shares,
      expectedAssets: expectedAssets.toString(),
      expectedAssetsBtc: satsToBtc(expectedAssets.toString()),
      minReceive,
      minReceiveBtc: satsToBtc(minReceive),
      currentSharePrice: stats.sharePrice,
    },
    instructions: "Sign and broadcast this transaction with your Stacks wallet",
  });
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Trigger harvest (would require admin auth in production)
app.post("/admin/harvest", async (c) => {
  // In production, verify admin signature
  const adminKey = c.req.header("X-Admin-Key");

  if (!adminKey) {
    return c.json({ error: "Admin key required" }, 401);
  }

  return c.json({
    message: "Harvest triggered",
    note: "In production, this calls the vault contract to harvest yields",
  });
});

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
