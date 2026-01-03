import type { VaultStats, UserPosition } from "./types";

// Vault contract addresses
export const VAULT_CONTRACT = "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-loop-vault";
export const VAULT_V1_CONTRACT = "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault";

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

// Call read-only contract function
async function callReadOnly(functionName: string, args: string[] = []): Promise<any> {
  const [address, name] = VAULT_CONTRACT.split(".");
  const url = `https://api.mainnet.hiro.so/v2/contracts/call-read/${address}/${name}/${functionName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: address,
      arguments: args,
    }),
  });

  if (!response.ok) {
    throw new Error(`Contract call failed: ${response.status}`);
  }

  const data = await response.json() as any;
  return data.result;
}

// Parse Clarity value from hex
function parseUint(hexValue: string): string {
  // Skip 0x01 prefix (success) and 0x01 type marker (uint)
  if (hexValue.startsWith("0x0701")) {
    const hex = hexValue.slice(6);
    return BigInt("0x" + hex).toString();
  }
  return "0";
}

// Get vault stats from contract
export async function getVaultStats(): Promise<VaultStats> {
  try {
    const result = await callReadOnly("get-vault-stats");

    // Parse the tuple response
    // For now, return parsed values or defaults
    return {
      totalAssets: "0",
      totalShares: "0",
      sharePrice: "100000000",
      tvlCap: CONFIG.maxTvl.toString(),
      tvlRemaining: CONFIG.maxTvl.toString(),
      pendingFees: "0",
      isPaused: false,
      managementFeeBps: CONFIG.managementFeeBps,
      loopIterations: CONFIG.loopIterations,
      estimatedApy: `${calculateEstimatedApy()}%`,
      liquidBalance: "0",
      deployedBalance: "0",
      usdhDebt: "0",
    };
  } catch (error) {
    console.error("Error fetching vault stats:", error);
    // Return defaults on error
    return {
      totalAssets: "0",
      totalShares: "0",
      sharePrice: "100000000",
      tvlCap: CONFIG.maxTvl.toString(),
      tvlRemaining: CONFIG.maxTvl.toString(),
      pendingFees: "0",
      isPaused: false,
      managementFeeBps: CONFIG.managementFeeBps,
      loopIterations: CONFIG.loopIterations,
      estimatedApy: `${calculateEstimatedApy()}%`,
    };
  }
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
// Note: V2 uses operator-managed deposits via record-deposit
export function buildDepositTransaction(amount: string, sender: string): object {
  const [address, name] = VAULT_CONTRACT.split(".");
  return {
    contractAddress: address,
    contractName: name,
    functionName: "record-deposit",
    functionArgs: [
      { type: "principal", value: sender },
      { type: "uint", value: amount },
    ],
    postConditions: [],
    network: "mainnet",
    note: "Operator calls this after receiving sBTC from user",
  };
}

// Build withdraw transaction
// Note: V2 uses operator-managed withdrawals via record-withdrawal
export function buildWithdrawTransaction(shares: string, sender: string, minReceive: string): object {
  const [address, name] = VAULT_CONTRACT.split(".");
  return {
    contractAddress: address,
    contractName: name,
    functionName: "record-withdrawal",
    functionArgs: [
      { type: "principal", value: sender },
      { type: "uint", value: shares },
    ],
    postConditions: [],
    network: "mainnet",
    note: "Operator calls this after sending sBTC to user",
  };
}

// Build deploy-to-strategy transaction
export function buildDeployToStrategyTransaction(amount: string): object {
  const [address, name] = VAULT_CONTRACT.split(".");
  return {
    contractAddress: address,
    contractName: name,
    functionName: "deploy-to-strategy",
    functionArgs: [
      { type: "uint", value: amount },
    ],
    network: "mainnet",
  };
}

// Build report-yield transaction
export function buildReportYieldTransaction(grossYield: string): object {
  const [address, name] = VAULT_CONTRACT.split(".");
  return {
    contractAddress: address,
    contractName: name,
    functionName: "report-yield",
    functionArgs: [
      { type: "uint", value: grossYield },
    ],
    network: "mainnet",
  };
}

// Format sats to BTC for display
export function satsToBtc(sats: string): string {
  const btc = Number(sats) / 100000000;
  return btc.toFixed(8);
}
