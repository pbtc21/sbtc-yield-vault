import type { VaultStats, UserPosition } from "./types";

// Vault contract address (to be deployed)
const VAULT_CONTRACT = "SPFE9JKCZ4XV35YND18FXCFT2Q32FHPVYKHNHYAF.sbtc-yield-vault";

// Vault configuration constants
const CONFIG = {
  maxTvl: 100000000n, // 1 BTC in sats
  managementFeeBps: 1000, // 10%
  loopIterations: 3,
  baseApy: 5, // 5% base from Zest
  leverage: 2.53, // From 3 loops at 70% borrow ratio
};

// Calculate estimated APY
function calculateEstimatedApy(): number {
  const grossApy = CONFIG.baseApy * CONFIG.leverage;
  const netApy = grossApy * (1 - CONFIG.managementFeeBps / 10000);
  return Math.round(netApy * 100) / 100;
}

// Get vault stats (mock for now, would call contract in production)
export async function getVaultStats(): Promise<VaultStats> {
  // In production, call the Stacks API to read contract state
  // const response = await fetch(`https://api.mainnet.hiro.so/v2/contracts/call-read/${VAULT_CONTRACT}/get-vault-stats`);

  // Mock response for now
  const totalAssets = "50000000"; // 0.5 BTC
  const totalShares = "50000000";
  const sharePrice = "100000000"; // 1.0 (no yield yet)

  return {
    totalAssets,
    totalShares,
    sharePrice,
    tvlCap: CONFIG.maxTvl.toString(),
    tvlRemaining: (CONFIG.maxTvl - BigInt(totalAssets)).toString(),
    pendingFees: "0",
    isPaused: false,
    managementFeeBps: CONFIG.managementFeeBps,
    loopIterations: CONFIG.loopIterations,
    estimatedApy: `${calculateEstimatedApy()}%`,
  };
}

// Get user position
export async function getUserPosition(address: string): Promise<UserPosition> {
  // In production, call contract read-only function
  // Mock for now
  const shares = "10000000"; // 0.1 BTC worth
  const deposited = "10000000";
  const currentAssets = "10500000"; // 5% profit
  const profit = (BigInt(currentAssets) - BigInt(deposited)).toString();
  const profitPercent = ((Number(profit) / Number(deposited)) * 100).toFixed(2);

  return {
    address,
    shares,
    assets: currentAssets,
    deposited,
    depositHeight: 5650000,
    profit,
    profitPercent: `${profitPercent}%`,
  };
}

// Build deposit transaction (returns unsigned tx for user to sign)
export function buildDepositTransaction(amount: string, sender: string): object {
  return {
    contractAddress: "SPFE9JKCZ4XV35YND18FXCFT2Q32FHPVYKHNHYAF",
    contractName: "sbtc-yield-vault",
    functionName: "deposit",
    functionArgs: [
      { type: "uint", value: amount },
    ],
    postConditions: [
      {
        type: "stx-postcondition",
        address: sender,
        condition: "eq",
        amount: amount,
      },
    ],
    network: "mainnet",
  };
}

// Build withdraw transaction
export function buildWithdrawTransaction(shares: string, sender: string, minReceive: string): object {
  return {
    contractAddress: "SPFE9JKCZ4XV35YND18FXCFT2Q32FHPVYKHNHYAF",
    contractName: "sbtc-yield-vault",
    functionName: "withdraw",
    functionArgs: [
      { type: "uint", value: shares },
    ],
    postConditions: [
      {
        type: "ft-postcondition",
        address: sender,
        asset: "SPFE9JKCZ4XV35YND18FXCFT2Q32FHPVYKHNHYAF.sbtc-yield-vault::vault-shares",
        condition: "eq",
        amount: shares,
      },
    ],
    network: "mainnet",
  };
}

// Format sats to BTC for display
export function satsToBtc(sats: string): string {
  const btc = Number(sats) / 100000000;
  return btc.toFixed(8);
}
