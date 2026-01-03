/**
 * Bitflow DEX Integration
 * Swap USDh → sBTC for looping strategy
 */

import {
  makeContractCall,
  AnchorMode,
  PostConditionMode,
  uintCV,
  principalCV,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

// Bitflow DEX Contract Addresses
export const BITFLOW_CONTRACTS = {
  // Main router
  router: "SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M.stableswap-stx-ststx-v-1-2",

  // Swap contracts for different pairs
  usdhSbtcSwap: "SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M.swap-helper-v1-03",
} as const;

// Token addresses
const TOKENS = {
  sbtc: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  usdh: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.usdh",
} as const;

// Get quote for USDh → sBTC swap
export async function getSwapQuote(
  usdhAmount: bigint,
  btcPriceUsd: number
): Promise<{
  expectedSbtc: bigint;
  minReceive: bigint;
  priceImpact: number;
  slippage: number;
}> {
  // Calculate expected sBTC based on current price
  // USDh has 6 decimals, sBTC has 8 decimals
  const usdhUsd = Number(usdhAmount) / 1_000_000;
  const expectedBtc = usdhUsd / btcPriceUsd;
  const expectedSbtcSats = BigInt(Math.floor(expectedBtc * 100_000_000));

  // Apply 1% slippage tolerance
  const slippage = 0.01;
  const minReceive = BigInt(Math.floor(Number(expectedSbtcSats) * (1 - slippage)));

  // Estimate price impact (simplified - would need pool reserves for accurate calc)
  const priceImpact = Number(usdhAmount) > 10_000_000_000 ? 0.5 : 0.1; // 0.5% for large swaps

  return {
    expectedSbtc: expectedSbtcSats,
    minReceive,
    priceImpact,
    slippage: slippage * 100,
  };
}

// Build swap transaction: USDh → sBTC
export function buildSwapTx(params: {
  usdhAmount: bigint;
  minSbtcReceive: bigint;
  recipient: string;
  senderKey: string;
}) {
  const { usdhAmount, minSbtcReceive, recipient, senderKey } = params;

  // Note: This is a simplified version
  // Actual Bitflow integration may require specific pool contracts
  return makeContractCall({
    contractAddress: "SPQC38PW542EQJ5M11CR25P7BS1CA6QT4TBXGB3M",
    contractName: "swap-helper-v1-03",
    functionName: "swap-helper",
    functionArgs: [
      principalCV(TOKENS.usdh), // token-in
      principalCV(TOKENS.sbtc), // token-out
      uintCV(usdhAmount), // amount-in
      uintCV(minSbtcReceive), // min-amount-out
    ],
    senderKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 10000n,
  });
}

// Alternative: Use Velar DEX for USDh → sBTC
export const VELAR_CONTRACTS = {
  router: "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-router",
} as const;

// Get best route across DEXes
export async function getBestSwapRoute(
  usdhAmount: bigint,
  btcPriceUsd: number
): Promise<{
  dex: "bitflow" | "velar";
  expectedSbtc: bigint;
  minReceive: bigint;
}> {
  // For now, default to Bitflow
  // In production, would query both DEXes and compare
  const quote = await getSwapQuote(usdhAmount, btcPriceUsd);

  return {
    dex: "bitflow",
    expectedSbtc: quote.expectedSbtc,
    minReceive: quote.minReceive,
  };
}
