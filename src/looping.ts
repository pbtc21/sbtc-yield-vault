/**
 * Looping Strategy Execution
 * Deposit sBTC → Borrow USDh → Swap to sBTC → Redeposit
 */

import { buildSupplyTx, buildBorrowTx, broadcastTx, calculateMaxBorrow, ZEST_CONTRACTS } from "./zest";
import { getBestSwapRoute, buildSwapTx } from "./bitflow";

// Strategy configuration
export interface LoopConfig {
  maxIterations: number;  // Number of loops (default: 3)
  targetLtvBps: number;   // Target LTV in basis points (default: 7000 = 70%)
  minLoopAmount: bigint;  // Minimum amount to continue looping (in sats)
  slippageBps: number;    // Slippage tolerance in basis points
}

export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxIterations: 3,
  targetLtvBps: 7000,
  minLoopAmount: 10000n, // 0.0001 BTC minimum
  slippageBps: 100, // 1%
};

// Loop execution result
export interface LoopResult {
  iteration: number;
  deposited: bigint;
  borrowed: bigint;
  swapped: bigint;
  txIds: string[];
}

// Calculate expected yields from looping
export function calculateLoopYield(params: {
  initialDeposit: bigint;
  loops: number;
  baseApy: number;
  ltvRatio: number;
}): {
  totalDeposited: bigint;
  leverage: number;
  grossApy: number;
  netApy: number;
  borrowCost: number;
} {
  const { initialDeposit, loops, baseApy, ltvRatio } = params;

  let totalDeposited = initialDeposit;
  let currentDeposit = initialDeposit;

  // Calculate total position after all loops
  for (let i = 0; i < loops; i++) {
    const borrowed = BigInt(Math.floor(Number(currentDeposit) * ltvRatio));
    currentDeposit = borrowed; // After swap, roughly same amount
    totalDeposited += currentDeposit;
  }

  const leverage = Number(totalDeposited) / Number(initialDeposit);

  // Calculate yields
  const grossApy = baseApy * leverage;
  const borrowCost = baseApy * 0.6 * (leverage - 1); // Borrow rate ~60% of supply rate
  const netApy = grossApy - borrowCost;

  return {
    totalDeposited,
    leverage,
    grossApy,
    netApy: Math.max(0, netApy),
    borrowCost,
  };
}

// Execute a single loop iteration
export async function executeLoopIteration(params: {
  depositAmount: bigint;
  owner: string;
  senderKey: string;
  btcPriceUsd: number;
  config: LoopConfig;
}): Promise<LoopResult> {
  const { depositAmount, owner, senderKey, btcPriceUsd, config } = params;
  const txIds: string[] = [];

  // Step 1: Supply sBTC to Zest
  console.log(`Supplying ${depositAmount} sats to Zest...`);
  const supplyTx = await buildSupplyTx({
    amount: depositAmount,
    owner,
    senderKey,
  });
  const supplyTxId = await broadcastTx(supplyTx);
  txIds.push(supplyTxId);
  console.log(`Supply tx: ${supplyTxId}`);

  // Wait for confirmation (in production, would poll for status)
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Step 2: Borrow USDh against collateral
  const borrowAmount = calculateMaxBorrow(depositAmount, btcPriceUsd, config.targetLtvBps);
  console.log(`Borrowing ${borrowAmount} micro-USDh...`);
  const borrowTx = await buildBorrowTx({
    amountToBorrow: borrowAmount,
    owner,
    senderKey,
  });
  const borrowTxId = await broadcastTx(borrowTx);
  txIds.push(borrowTxId);
  console.log(`Borrow tx: ${borrowTxId}`);

  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Step 3: Swap USDh → sBTC
  const swapRoute = await getBestSwapRoute(borrowAmount, btcPriceUsd);
  console.log(`Swapping USDh for ~${swapRoute.expectedSbtc} sats sBTC...`);
  const swapTx = buildSwapTx({
    usdhAmount: borrowAmount,
    minSbtcReceive: swapRoute.minReceive,
    recipient: owner,
    senderKey,
  });
  const swapTxId = await broadcastTx(swapTx);
  txIds.push(swapTxId);
  console.log(`Swap tx: ${swapTxId}`);

  return {
    iteration: 1,
    deposited: depositAmount,
    borrowed: borrowAmount,
    swapped: swapRoute.expectedSbtc,
    txIds,
  };
}

// Execute full looping strategy
export async function executeFullLoop(params: {
  initialDeposit: bigint;
  owner: string;
  senderKey: string;
  btcPriceUsd: number;
  config?: Partial<LoopConfig>;
}): Promise<{
  success: boolean;
  totalDeposited: bigint;
  totalBorrowed: bigint;
  iterations: LoopResult[];
  error?: string;
}> {
  const config = { ...DEFAULT_LOOP_CONFIG, ...params.config };
  const { initialDeposit, owner, senderKey, btcPriceUsd } = params;

  const iterations: LoopResult[] = [];
  let currentDeposit = initialDeposit;
  let totalDeposited = 0n;
  let totalBorrowed = 0n;

  try {
    for (let i = 0; i < config.maxIterations; i++) {
      // Check if amount is too small to continue
      if (currentDeposit < config.minLoopAmount) {
        console.log(`Deposit amount ${currentDeposit} below minimum, stopping loops`);
        break;
      }

      console.log(`\n=== Loop Iteration ${i + 1}/${config.maxIterations} ===`);

      const result = await executeLoopIteration({
        depositAmount: currentDeposit,
        owner,
        senderKey,
        btcPriceUsd,
        config,
      });

      iterations.push({ ...result, iteration: i + 1 });
      totalDeposited += result.deposited;
      totalBorrowed += result.borrowed;

      // Next iteration uses the swapped sBTC
      currentDeposit = result.swapped;

      // Wait between iterations
      if (i < config.maxIterations - 1) {
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
    }

    return {
      success: true,
      totalDeposited,
      totalBorrowed,
      iterations,
    };
  } catch (error) {
    return {
      success: false,
      totalDeposited,
      totalBorrowed,
      iterations,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Simulate loop without executing (for preview)
export function simulateLoop(params: {
  initialDeposit: bigint;
  btcPriceUsd: number;
  config?: Partial<LoopConfig>;
}): {
  iterations: Array<{
    deposit: bigint;
    borrow: bigint;
    swapReceive: bigint;
  }>;
  totalDeposited: bigint;
  totalBorrowed: bigint;
  leverage: number;
  estimatedApy: number;
} {
  const config = { ...DEFAULT_LOOP_CONFIG, ...params.config };
  const { initialDeposit, btcPriceUsd } = params;

  const iterations: Array<{
    deposit: bigint;
    borrow: bigint;
    swapReceive: bigint;
  }> = [];

  let currentDeposit = initialDeposit;
  let totalDeposited = 0n;
  let totalBorrowed = 0n;

  for (let i = 0; i < config.maxIterations; i++) {
    if (currentDeposit < config.minLoopAmount) break;

    // Calculate borrow amount (70% LTV)
    const borrowUsdh = calculateMaxBorrow(currentDeposit, btcPriceUsd, config.targetLtvBps);

    // Calculate swap output (assume 0.5% slippage)
    const swapReceiveSats = BigInt(
      Math.floor((Number(borrowUsdh) / 1_000_000 / btcPriceUsd) * 100_000_000 * 0.995)
    );

    iterations.push({
      deposit: currentDeposit,
      borrow: borrowUsdh,
      swapReceive: swapReceiveSats,
    });

    totalDeposited += currentDeposit;
    totalBorrowed += borrowUsdh;
    currentDeposit = swapReceiveSats;
  }

  const leverage = Number(totalDeposited) / Number(initialDeposit);
  const baseApy = 5.0; // 5% base APY from Zest
  const estimatedApy = baseApy * leverage * 0.9; // After fees

  return {
    iterations,
    totalDeposited,
    totalBorrowed,
    leverage,
    estimatedApy,
  };
}
