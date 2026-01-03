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
import { getZestPoolData, ZEST_CONTRACTS } from "./zest";
import { simulateLoop, calculateLoopYield, DEFAULT_LOOP_CONFIG } from "./looping";
import { getExecutorStatus, getBtcPrice } from "./executor";

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

// ============================================
// ZEST INTEGRATION ENDPOINTS
// ============================================

// Get Zest Protocol pool data
app.get("/zest/stats", async (c) => {
  const poolData = await getZestPoolData();

  return c.json({
    protocol: "Zest Protocol",
    contracts: ZEST_CONTRACTS,
    pool: poolData,
    description: "Real-time data from Zest Protocol lending markets",
  });
});

// Simulate looping strategy
app.post("/simulate", async (c) => {
  const body = await c.req.json<{
    amount: string;
    btcPrice?: number;
    loops?: number;
  }>();

  if (!body.amount) {
    return c.json({ error: "amount is required (in sats)" }, 400);
  }

  const amount = BigInt(body.amount);
  const btcPrice = body.btcPrice || 100000; // Default $100k BTC
  const loops = body.loops || DEFAULT_LOOP_CONFIG.maxIterations;

  // Simulate the loop
  const simulation = simulateLoop({
    initialDeposit: amount,
    btcPriceUsd: btcPrice,
    config: { maxIterations: loops },
  });

  // Calculate yield projections
  const yieldCalc = calculateLoopYield({
    initialDeposit: amount,
    loops,
    baseApy: 5.0,
    ltvRatio: 0.7,
  });

  return c.json({
    input: {
      amount: body.amount,
      amountBtc: satsToBtc(body.amount),
      btcPrice,
      loops,
    },
    simulation: {
      iterations: simulation.iterations.map((iter, i) => ({
        loop: i + 1,
        deposit: iter.deposit.toString(),
        depositBtc: satsToBtc(iter.deposit.toString()),
        borrow: iter.borrow.toString(),
        borrowUsd: (Number(iter.borrow) / 1_000_000).toFixed(2),
        swapReceive: iter.swapReceive.toString(),
        swapReceiveBtc: satsToBtc(iter.swapReceive.toString()),
      })),
      totalDeposited: simulation.totalDeposited.toString(),
      totalDepositedBtc: satsToBtc(simulation.totalDeposited.toString()),
      totalBorrowed: simulation.totalBorrowed.toString(),
      totalBorrowedUsd: (Number(simulation.totalBorrowed) / 1_000_000).toFixed(2),
      leverage: simulation.leverage.toFixed(2) + "x",
    },
    projectedYield: {
      leverage: yieldCalc.leverage.toFixed(2) + "x",
      grossApy: yieldCalc.grossApy.toFixed(2) + "%",
      borrowCost: yieldCalc.borrowCost.toFixed(2) + "%",
      netApy: yieldCalc.netApy.toFixed(2) + "%",
      afterFee: (yieldCalc.netApy * 0.9).toFixed(2) + "% (10% mgmt fee)",
    },
  });
});

// Get contracts info
app.get("/contracts", (c) => {
  return c.json({
    vault: {
      address: "Not yet deployed",
      network: "mainnet",
    },
    integrations: {
      zest: ZEST_CONTRACTS,
      sbtc: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    },
    strategy: {
      type: "Leveraged sBTC Yield",
      loops: 3,
      targetLtv: "70%",
      estimatedApy: "~11%",
    },
  });
});

// Get executor status (vault operator wallet)
app.get("/executor/status", async (c) => {
  const status = await getExecutorStatus();
  const btcPrice = await getBtcPrice();

  return c.json({
    ...status,
    btcPrice: {
      usd: btcPrice,
      source: "CoinGecko",
    },
  });
});

// Get current BTC price
app.get("/price/btc", async (c) => {
  const price = await getBtcPrice();
  return c.json({
    asset: "BTC",
    priceUsd: price,
    timestamp: new Date().toISOString(),
  });
});

export default app;
