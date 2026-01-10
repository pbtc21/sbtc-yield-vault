import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import type { Env, Variables } from "./types";
import { getZestPoolData, getZestRates, ZEST_CONTRACTS, calculateMaxBorrow, type ZestPoolData } from "./zest";
import { getBestSwapRoute, getSwapQuote } from "./bitflow";
import { getBtcPrice } from "./executor";

/**
 * sBTC Yield Vault v3 API
 * Secure yield amplification using BSD (USDh) borrowing on Zest Protocol
 *
 * Security Features:
 * - Direct sBTC custody (not operator trust)
 * - Health factor monitoring with auto-deleverage
 * - Slippage protection on all swaps
 * - Emergency withdrawal mechanism
 * - Keeper-based automation with rate limits
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================
// CONFIGURATION
// ============================================

const VAULT_CONFIG = {
  contract: "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault-v3",
  maxTvl: 100_000_000n, // 1 BTC in sats
  managementFeeBps: 1000, // 10%
  maxLtvBps: 7000, // 70%
  liquidationThresholdBps: 8000, // 80%
  targetLoops: 3,
  minHealthFactor: 1.2,
  maxSlippageBps: 100, // 1%
  compoundIntervalBlocks: 144, // ~24 hours
} as const;

const KEEPER_CONFIG = {
  healthCheckInterval: 6, // blocks (~1 hour)
  autoCompoundThreshold: 10_000n, // 0.0001 BTC min yield to compound
  deleverageThreshold: 1.5, // Health factor below this triggers deleverage
  emergencyThreshold: 1.2, // Health factor below this = emergency
} as const;

// ============================================
// MIDDLEWARE
// ============================================

app.use("*", cors());

// Keeper authentication middleware
const keeperAuth = bearerAuth({
  verifyToken: async (token, c) => {
    const validTokens = (c.env?.KEEPER_TOKENS || "").split(",");
    return validTokens.includes(token);
  },
});

// ============================================
// TYPES
// ============================================

interface VaultState {
  totalAssets: bigint;
  liquidBalance: bigint;
  deployedBalance: bigint;
  totalShares: bigint;
  sharePrice: bigint;
  usdhDebt: bigint;
  healthFactor: number;
  btcPrice: number;
  isPaused: boolean;
  emergencyMode: boolean;
  lastHarvest: number;
}

interface HealthStatus {
  healthFactor: number;
  status: "healthy" | "safe" | "warning" | "critical";
  ltv: number;
  canBorrow: boolean;
  shouldDeleverage: boolean;
  emergencyTriggered: boolean;
  recommendations: string[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function satsToBtc(sats: bigint | string): string {
  return (Number(sats) / 100_000_000).toFixed(8);
}

function calculateHealthFactor(deployed: bigint, debt: bigint, btcPrice: number): number {
  if (debt === 0n) return 999;
  const collateralUsd = (Number(deployed) / 100_000_000) * btcPrice;
  const debtUsd = Number(debt) / 1_000_000;
  return collateralUsd / debtUsd;
}

function calculateLtv(deployed: bigint, debt: bigint, btcPrice: number): number {
  if (deployed === 0n) return 0;
  const collateralUsd = (Number(deployed) / 100_000_000) * btcPrice;
  const debtUsd = Number(debt) / 1_000_000;
  return (debtUsd / collateralUsd) * 100;
}

async function getVaultState(): Promise<VaultState> {
  // In production, read from contract
  // For now, return mock state
  const btcPrice = await getBtcPrice();
  return {
    totalAssets: 50_000_000n,
    liquidBalance: 10_000_000n,
    deployedBalance: 40_000_000n,
    totalShares: 50_000_000n,
    sharePrice: 100_000_000n,
    usdhDebt: 28_000_000_000n, // $28k borrowed
    healthFactor: 1.43,
    btcPrice,
    isPaused: false,
    emergencyMode: false,
    lastHarvest: 5680000,
  };
}

async function getHealthStatus(): Promise<HealthStatus> {
  const state = await getVaultState();
  const health = calculateHealthFactor(state.deployedBalance, state.usdhDebt, state.btcPrice);
  const ltv = calculateLtv(state.deployedBalance, state.usdhDebt, state.btcPrice);

  const recommendations: string[] = [];

  let status: HealthStatus["status"] = "healthy";
  if (health < KEEPER_CONFIG.emergencyThreshold) {
    status = "critical";
    recommendations.push("EMERGENCY: Immediate deleveraging required");
  } else if (health < KEEPER_CONFIG.deleverageThreshold) {
    status = "warning";
    recommendations.push("Deleverage recommended to improve health factor");
  } else if (health < 2.0) {
    status = "safe";
    recommendations.push("Monitor closely, consider reducing leverage");
  } else {
    recommendations.push("Vault health is optimal");
  }

  return {
    healthFactor: health,
    status,
    ltv,
    canBorrow: health >= 1.5 && ltv < VAULT_CONFIG.maxLtvBps / 100,
    shouldDeleverage: health < KEEPER_CONFIG.deleverageThreshold,
    emergencyTriggered: health < KEEPER_CONFIG.emergencyThreshold,
    recommendations,
  };
}

// ============================================
// PUBLIC ENDPOINTS
// ============================================

app.get("/", (c) => {
  return c.json({
    service: "sBTC Yield Vault v3",
    version: "3.0.0",
    description: "Secure leveraged yield vault using sBTC + BSD (USDh) on Zest Protocol",
    features: [
      "Direct sBTC custody (trustless deposits)",
      "Health factor monitoring with auto-deleverage",
      "Slippage protection on all operations",
      "Emergency withdrawal mechanism",
      "Keeper automation for compounding",
    ],
    endpoints: {
      // Public
      "GET /": "API info",
      "GET /stats": "Vault statistics",
      "GET /health": "Health factor status",
      "GET /position/:address": "User position",
      "POST /simulate": "Simulate deposit outcome",
      // User actions
      "POST /deposit": "Deposit sBTC",
      "POST /request-withdrawal": "Request withdrawal (starts cooldown)",
      "POST /complete-withdrawal": "Complete withdrawal after cooldown",
      "POST /emergency-withdraw": "Emergency withdraw (if health critical)",
      // Keeper (authenticated)
      "POST /keeper/compound": "Trigger compound cycle",
      "POST /keeper/rebalance": "Rebalance position",
      "POST /keeper/update-price": "Update BTC price",
    },
    config: {
      strategy: "3-loop sBTC leverage on Zest with BSD borrowing",
      targetLtv: "70%",
      liquidationThreshold: "80%",
      managementFee: "10%",
      tvlCap: "1 BTC",
      minHealthFactor: KEEPER_CONFIG.emergencyThreshold,
    },
    contracts: {
      vault: VAULT_CONFIG.contract,
      zest: ZEST_CONTRACTS.borrowHelper,
      sbtc: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
      usdh: "SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1",
    },
  });
});

// Vault statistics
app.get("/stats", async (c) => {
  const state = await getVaultState();
  const health = await getHealthStatus();
  const zestData = await getZestPoolData();

  return c.json({
    vault: {
      totalAssets: state.totalAssets.toString(),
      totalAssetsBtc: satsToBtc(state.totalAssets),
      liquidBalance: state.liquidBalance.toString(),
      liquidBalanceBtc: satsToBtc(state.liquidBalance),
      deployedBalance: state.deployedBalance.toString(),
      deployedBalanceBtc: satsToBtc(state.deployedBalance),
      totalShares: state.totalShares.toString(),
      sharePrice: state.sharePrice.toString(),
      tvlCap: VAULT_CONFIG.maxTvl.toString(),
      tvlRemaining: (VAULT_CONFIG.maxTvl - state.totalAssets).toString(),
      utilizationRate: `${((Number(state.deployedBalance) / Number(state.totalAssets)) * 100).toFixed(1)}%`,
    },
    position: {
      usdhDebt: state.usdhDebt.toString(),
      usdhDebtUsd: `$${(Number(state.usdhDebt) / 1_000_000).toFixed(2)}`,
      ltv: `${calculateLtv(state.deployedBalance, state.usdhDebt, state.btcPrice).toFixed(1)}%`,
      leverage: `${(Number(state.deployedBalance) / Number(state.liquidBalance + state.deployedBalance - state.usdhDebt / BigInt(Math.floor(state.btcPrice * 100)))).toFixed(2)}x`,
    },
    health: {
      factor: health.healthFactor.toFixed(2),
      status: health.status,
      canBorrow: health.canBorrow,
      shouldDeleverage: health.shouldDeleverage,
      recommendations: health.recommendations,
    },
    market: {
      btcPrice: state.btcPrice,
      zestSupplyApy: zestData.supplyApy,
      zestBorrowApy: zestData.borrowApy,
    },
    status: {
      isPaused: state.isPaused,
      emergencyMode: state.emergencyMode,
      lastHarvest: state.lastHarvest,
    },
  });
});

// Health status
app.get("/health", async (c) => {
  const health = await getHealthStatus();
  const state = await getVaultState();

  return c.json({
    ...health,
    details: {
      collateralValueUsd: (Number(state.deployedBalance) / 100_000_000) * state.btcPrice,
      debtValueUsd: Number(state.usdhDebt) / 1_000_000,
      btcPrice: state.btcPrice,
    },
    thresholds: {
      targetLtv: `${VAULT_CONFIG.maxLtvBps / 100}%`,
      liquidationLtv: `${VAULT_CONFIG.liquidationThresholdBps / 100}%`,
      minHealthFactor: KEEPER_CONFIG.emergencyThreshold,
      deleverageThreshold: KEEPER_CONFIG.deleverageThreshold,
    },
  });
});

// User position
app.get("/position/:address", async (c) => {
  const address = c.req.param("address");

  if (!address?.startsWith("SP")) {
    return c.json({ error: "Invalid Stacks address" }, 400);
  }

  const state = await getVaultState();

  // Mock user position - in production read from contract
  const userShares = 5_000_000n;
  const initialDeposit = 4_800_000n;
  const currentAssets = (userShares * state.sharePrice) / 100_000_000n;
  const profit = currentAssets - initialDeposit;
  const profitPercent = (Number(profit) / Number(initialDeposit)) * 100;

  return c.json({
    address,
    shares: userShares.toString(),
    currentValue: currentAssets.toString(),
    currentValueBtc: satsToBtc(currentAssets),
    initialDeposit: initialDeposit.toString(),
    initialDepositBtc: satsToBtc(initialDeposit),
    profit: profit.toString(),
    profitBtc: satsToBtc(profit),
    profitPercent: `${profitPercent.toFixed(2)}%`,
    shareOfVault: `${((Number(userShares) / Number(state.totalShares)) * 100).toFixed(2)}%`,
    pendingWithdrawal: null,
    maxLossSetting: "5%",
  });
});

// Simulate deposit
app.post("/simulate", async (c) => {
  const body = await c.req.json<{
    amount: string;
    loops?: number;
  }>();

  if (!body.amount) {
    return c.json({ error: "amount is required (in sats)" }, 400);
  }

  const amount = BigInt(body.amount);
  const loops = body.loops || VAULT_CONFIG.targetLoops;
  const btcPrice = await getBtcPrice();

  // Get real Zest rates
  const zestRates = await getZestRates();
  const supplyApy = zestRates.sbtc.supplyApy; // Total APY including incentives
  const borrowApy = zestRates.usdh.borrowApy; // USDh borrow rate

  // Calculate loop progression
  const iterations: Array<{
    loop: number;
    deposit: string;
    depositBtc: string;
    borrow: string;
    borrowUsd: string;
    swapReceive: string;
    swapReceiveBtc: string;
    healthAfter: string;
  }> = [];

  let currentDeposit = amount;
  let totalDeposited = 0n;
  let totalBorrowed = 0n;

  for (let i = 0; i < loops; i++) {
    const borrowAmount = calculateMaxBorrow(currentDeposit, btcPrice, VAULT_CONFIG.maxLtvBps);
    const swapQuote = await getSwapQuote(borrowAmount, btcPrice);

    totalDeposited += currentDeposit;
    totalBorrowed += borrowAmount;

    const healthAfter = calculateHealthFactor(totalDeposited, totalBorrowed, btcPrice);

    iterations.push({
      loop: i + 1,
      deposit: currentDeposit.toString(),
      depositBtc: satsToBtc(currentDeposit),
      borrow: borrowAmount.toString(),
      borrowUsd: `$${(Number(borrowAmount) / 1_000_000).toFixed(2)}`,
      swapReceive: swapQuote.expectedSbtc.toString(),
      swapReceiveBtc: satsToBtc(swapQuote.expectedSbtc),
      healthAfter: healthAfter.toFixed(2),
    });

    currentDeposit = swapQuote.expectedSbtc;
  }

  // Calculate yields using REAL Zest rates
  const leverage = Number(totalDeposited) / Number(amount);

  // Gross APY = supply rate on total deposited collateral
  const grossApy = supplyApy * leverage;

  // Borrow cost = borrow rate on total borrowed (converted to BTC terms)
  // The debt is in USD but we pay interest, which reduces our BTC-denominated returns
  const borrowCostBps = borrowApy * (leverage - 1);

  // Net APY = what you earn minus what you pay
  const netApy = grossApy - borrowCostBps;

  // After management fee
  const afterFeeApy = netApy * (1 - VAULT_CONFIG.managementFeeBps / 10000);

  return c.json({
    input: {
      amount: body.amount,
      amountBtc: satsToBtc(body.amount),
      loops,
      btcPrice,
    },
    rates: {
      source: "Zest Protocol (live)",
      sbtcSupplyApy: `${supplyApy.toFixed(1)}%`,
      sbtcSupplyApyBase: `${zestRates.sbtc.supplyApyBase.toFixed(1)}%`,
      sbtcSupplyApyIncentives: `${zestRates.sbtc.supplyApyIncentives.toFixed(1)}%`,
      usdhBorrowApy: `${borrowApy.toFixed(1)}%`,
      spread: `${(supplyApy - borrowApy).toFixed(1)}%`,
    },
    simulation: {
      iterations,
      totalDeposited: totalDeposited.toString(),
      totalDepositedBtc: satsToBtc(totalDeposited),
      totalBorrowed: totalBorrowed.toString(),
      totalBorrowedUsd: `$${(Number(totalBorrowed) / 1_000_000).toFixed(2)}`,
      finalLeverage: `${leverage.toFixed(2)}x`,
      finalHealthFactor: calculateHealthFactor(totalDeposited, totalBorrowed, btcPrice).toFixed(2),
      finalLtv: `${calculateLtv(totalDeposited, totalBorrowed, btcPrice).toFixed(1)}%`,
    },
    projectedYield: {
      grossApy: `${grossApy.toFixed(2)}%`,
      borrowCost: `${borrowCostBps.toFixed(2)}%`,
      netApy: `${netApy.toFixed(2)}%`,
      afterFees: `${afterFeeApy.toFixed(2)}%`,
      yearlyYieldBtc: satsToBtc(BigInt(Math.floor(Number(amount) * afterFeeApy / 100))),
      yearlyYieldUsd: `$${((Number(amount) / 100_000_000) * btcPrice * afterFeeApy / 100).toFixed(2)}`,
    },
    comparison: {
      withoutLeverage: `${supplyApy.toFixed(2)}%`,
      withLeverage: `${afterFeeApy.toFixed(2)}%`,
      improvement: `${((afterFeeApy / supplyApy - 1) * 100).toFixed(0)}% more yield`,
    },
    risks: {
      liquidationPrice: `$${(btcPrice * (VAULT_CONFIG.liquidationThresholdBps / VAULT_CONFIG.maxLtvBps)).toFixed(0)}`,
      maxDrawdown: `${((1 - VAULT_CONFIG.maxLtvBps / VAULT_CONFIG.liquidationThresholdBps) * 100).toFixed(1)}%`,
      healthFactorBuffer: (calculateHealthFactor(totalDeposited, totalBorrowed, btcPrice) - KEEPER_CONFIG.emergencyThreshold).toFixed(2),
    },
  });
});

// ============================================
// USER ACTION ENDPOINTS
// ============================================

// Deposit sBTC
app.post("/deposit", async (c) => {
  const body = await c.req.json<{
    amount: string;
    sender: string;
    maxLossBps?: number;
  }>();

  if (!body.amount || !body.sender) {
    return c.json({ error: "amount and sender are required" }, 400);
  }

  const amount = BigInt(body.amount);
  const state = await getVaultState();

  // Validate
  if (amount < 10_000n) {
    return c.json({ error: "Minimum deposit is 0.0001 BTC (10,000 sats)" }, 400);
  }

  if (state.totalAssets + amount > VAULT_CONFIG.maxTvl) {
    return c.json({
      error: "Deposit exceeds TVL cap",
      maxDeposit: (VAULT_CONFIG.maxTvl - state.totalAssets).toString(),
    }, 400);
  }

  if (state.isPaused) {
    return c.json({ error: "Vault is paused" }, 400);
  }

  if (state.emergencyMode) {
    return c.json({ error: "Vault is in emergency mode - deposits disabled" }, 400);
  }

  const sharesToMint = (amount * state.totalShares) / state.totalAssets || amount;
  const maxLossBps = Math.min(body.maxLossBps || 500, 1000); // Max 10%

  return c.json({
    message: "Deposit transaction ready",
    transaction: {
      contractAddress: VAULT_CONFIG.contract.split(".")[0],
      contractName: VAULT_CONFIG.contract.split(".")[1],
      functionName: "deposit",
      functionArgs: [
        { type: "uint", value: body.amount },
        { type: "uint", value: maxLossBps.toString() },
      ],
      postConditions: [
        {
          type: "stx-transfer",
          principal: body.sender,
          amount: body.amount,
          asset: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
        },
      ],
      network: "mainnet",
    },
    deposit: {
      amount: body.amount,
      amountBtc: satsToBtc(body.amount),
      expectedShares: sharesToMint.toString(),
      currentSharePrice: state.sharePrice.toString(),
      maxLossProtection: `${maxLossBps / 100}%`,
    },
    instructions: [
      "1. Sign this transaction with your Stacks wallet",
      "2. sBTC will be transferred directly to the vault contract",
      "3. You'll receive vault shares (yvsBTC-v3) in return",
      "4. Your max loss protection is set - emergency withdraw if exceeded",
    ],
  });
});

// Request withdrawal
app.post("/request-withdrawal", async (c) => {
  const body = await c.req.json<{
    shares: string;
    sender: string;
    minReceive?: string;
  }>();

  if (!body.shares || !body.sender) {
    return c.json({ error: "shares and sender are required" }, 400);
  }

  const shares = BigInt(body.shares);
  const state = await getVaultState();
  const expectedAssets = (shares * state.sharePrice) / 100_000_000n;

  // Default 1% slippage protection
  const minReceive = body.minReceive
    ? BigInt(body.minReceive)
    : expectedAssets * 99n / 100n;

  return c.json({
    message: "Withdrawal request transaction ready",
    transaction: {
      contractAddress: VAULT_CONFIG.contract.split(".")[0],
      contractName: VAULT_CONFIG.contract.split(".")[1],
      functionName: "request-withdrawal",
      functionArgs: [
        { type: "uint", value: body.shares },
        { type: "uint", value: minReceive.toString() },
      ],
      network: "mainnet",
    },
    withdrawal: {
      shares: body.shares,
      expectedAssets: expectedAssets.toString(),
      expectedAssetsBtc: satsToBtc(expectedAssets),
      minReceive: minReceive.toString(),
      minReceiveBtc: satsToBtc(minReceive),
      slippageProtection: `${((Number(expectedAssets - minReceive) / Number(expectedAssets)) * 100).toFixed(2)}%`,
      cooldownBlocks: 144,
      cooldownHours: "~24",
    },
    instructions: [
      "1. Sign this transaction to request withdrawal",
      "2. Wait 144 blocks (~24 hours) cooldown period",
      "3. Call complete-withdrawal after cooldown",
      "4. If assets fall below minReceive, withdrawal fails (protection)",
    ],
  });
});

// Complete withdrawal
app.post("/complete-withdrawal", async (c) => {
  const body = await c.req.json<{ sender: string }>();

  if (!body.sender) {
    return c.json({ error: "sender is required" }, 400);
  }

  return c.json({
    message: "Complete withdrawal transaction ready",
    transaction: {
      contractAddress: VAULT_CONFIG.contract.split(".")[0],
      contractName: VAULT_CONFIG.contract.split(".")[1],
      functionName: "complete-withdrawal",
      functionArgs: [],
      network: "mainnet",
    },
    instructions: [
      "1. Sign this transaction to complete your withdrawal",
      "2. Vault shares will be burned",
      "3. sBTC will be transferred to your wallet",
      "4. Transaction fails if minReceive not met (slippage protection)",
    ],
  });
});

// Emergency withdrawal
app.post("/emergency-withdraw", async (c) => {
  const body = await c.req.json<{ sender: string }>();
  const health = await getHealthStatus();

  if (!health.emergencyTriggered) {
    return c.json({
      error: "Emergency withdrawal only available when health is critical",
      currentHealth: health.healthFactor,
      threshold: KEEPER_CONFIG.emergencyThreshold,
    }, 400);
  }

  return c.json({
    message: "Emergency withdrawal transaction ready",
    warning: "Emergency withdrawal accepts current share price - no slippage protection",
    transaction: {
      contractAddress: VAULT_CONFIG.contract.split(".")[0],
      contractName: VAULT_CONFIG.contract.split(".")[1],
      functionName: "emergency-withdraw",
      functionArgs: [],
      network: "mainnet",
    },
    healthStatus: health,
  });
});

// ============================================
// KEEPER ENDPOINTS (Authenticated)
// ============================================

// Trigger compound cycle
app.post("/keeper/compound", keeperAuth, async (c) => {
  const health = await getHealthStatus();
  const state = await getVaultState();

  // Safety checks
  if (state.emergencyMode) {
    return c.json({ error: "Cannot compound in emergency mode" }, 400);
  }

  if (!health.canBorrow) {
    return c.json({
      error: "Health too low to compound",
      recommendation: "Run /keeper/rebalance first",
      health: health.healthFactor,
    }, 400);
  }

  const btcPrice = state.btcPrice;
  const liquidBalance = state.liquidBalance;

  if (liquidBalance < KEEPER_CONFIG.autoCompoundThreshold) {
    return c.json({
      message: "Insufficient balance to compound",
      liquidBalance: liquidBalance.toString(),
      threshold: KEEPER_CONFIG.autoCompoundThreshold.toString(),
    });
  }

  // Calculate compound steps
  const steps = [];
  let currentDeposit = liquidBalance;

  for (let i = 0; i < VAULT_CONFIG.targetLoops; i++) {
    const borrowAmount = calculateMaxBorrow(currentDeposit, btcPrice, VAULT_CONFIG.maxLtvBps);
    const swapQuote = await getSwapQuote(borrowAmount, btcPrice);

    steps.push({
      step: i + 1,
      action: i === 0 ? "deploy-to-zest" : "supply-and-borrow",
      deposit: currentDeposit.toString(),
      borrow: borrowAmount.toString(),
      expectedSwap: swapQuote.expectedSbtc.toString(),
      minReceive: swapQuote.minReceive.toString(),
    });

    currentDeposit = swapQuote.minReceive;
  }

  return c.json({
    message: "Compound cycle ready",
    currentHealth: health.healthFactor,
    steps,
    transactions: steps.map((step, i) => ({
      order: i + 1,
      contract: i === 0 ? VAULT_CONFIG.contract : ZEST_CONTRACTS.borrowHelper,
      function: step.action,
      args: step,
    })),
    estimatedGas: "~0.05 STX total",
    warning: "Execute in order, verify each step before proceeding",
  });
});

// Rebalance (deleverage if needed)
app.post("/keeper/rebalance", keeperAuth, async (c) => {
  const health = await getHealthStatus();
  const state = await getVaultState();

  if (!health.shouldDeleverage) {
    return c.json({
      message: "No rebalancing needed",
      health: health.healthFactor,
      status: health.status,
    });
  }

  // Calculate how much to repay to reach safe health
  const targetHealth = 1.8;
  const currentCollateralUsd = (Number(state.deployedBalance) / 100_000_000) * state.btcPrice;
  const targetDebtUsd = currentCollateralUsd / targetHealth;
  const currentDebtUsd = Number(state.usdhDebt) / 1_000_000;
  const repayAmountUsd = currentDebtUsd - targetDebtUsd;
  const repayAmountUsdh = BigInt(Math.floor(repayAmountUsd * 1_000_000));

  return c.json({
    message: "Rebalancing required",
    currentHealth: health.healthFactor,
    targetHealth,
    currentDebt: state.usdhDebt.toString(),
    repayAmount: repayAmountUsdh.toString(),
    repayAmountUsd: `$${repayAmountUsd.toFixed(2)}`,
    steps: [
      {
        step: 1,
        action: "Withdraw sBTC from Zest to repay",
        amount: "calculated based on swap rate",
      },
      {
        step: 2,
        action: "Swap sBTC to USDh",
        amount: repayAmountUsdh.toString(),
      },
      {
        step: 3,
        action: "Repay USDh debt on Zest",
        amount: repayAmountUsdh.toString(),
      },
      {
        step: 4,
        action: "Record repayment in vault",
        contract: VAULT_CONFIG.contract,
        function: "record-repay",
      },
    ],
    urgency: health.emergencyTriggered ? "CRITICAL" : "HIGH",
  });
});

// Update price
app.post("/keeper/update-price", keeperAuth, async (c) => {
  const btcPrice = await getBtcPrice();
  const health = await getHealthStatus();

  return c.json({
    message: "Price update ready",
    transaction: {
      contractAddress: VAULT_CONFIG.contract.split(".")[0],
      contractName: VAULT_CONFIG.contract.split(".")[1],
      functionName: "update-price",
      functionArgs: [
        { type: "uint", value: Math.floor(btcPrice * 1_000_000).toString() },
      ],
    },
    price: {
      btcUsd: btcPrice,
      priceInContract: Math.floor(btcPrice * 1_000_000),
    },
    healthAfterUpdate: health,
  });
});

// Health check endpoint
app.get("/keeper/status", async (c) => {
  const health = await getHealthStatus();
  const state = await getVaultState();

  return c.json({
    health,
    state: {
      liquidBalance: state.liquidBalance.toString(),
      deployedBalance: state.deployedBalance.toString(),
      usdhDebt: state.usdhDebt.toString(),
      lastHarvest: state.lastHarvest,
    },
    actions: {
      needsCompound: state.liquidBalance >= KEEPER_CONFIG.autoCompoundThreshold,
      needsRebalance: health.shouldDeleverage,
      needsPriceUpdate: false, // Would check staleness
      emergencyRequired: health.emergencyTriggered,
    },
  });
});

// ============================================
// SYSTEM ENDPOINTS
// ============================================

app.get("/health-check", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/contracts", (c) => {
  return c.json({
    vault: VAULT_CONFIG.contract,
    integrations: {
      zest: ZEST_CONTRACTS,
      sbtc: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
      usdh: "SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1",
    },
    config: VAULT_CONFIG,
  });
});

export default app;
