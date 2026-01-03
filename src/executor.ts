/**
 * Loop Strategy Executor
 * Uses the configured wallet to execute looping strategy on-chain
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  uintCV,
  principalCV,
  noneCV,
  listCV,
  tupleCV,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";
import { ZEST_CONTRACTS } from "./zest";

// Vault operator wallet address (public, set at deployment)
const VAULT_OPERATOR_ADDRESS = "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA";

// Load wallet - in Workers, we only expose the public address
// Private key operations require admin access via separate secure endpoint
export function loadWallet(): {
  mainnetAddress: string;
  testnetAddress: string;
} {
  return {
    mainnetAddress: VAULT_OPERATOR_ADDRESS,
    testnetAddress: "ST2QXPFF4M72QYZWXE7S5321XJDJ2DD32DKVZXW5D",
  };
}

// Check wallet STX balance for fees
export async function getWalletBalance(address: string): Promise<{
  stx: bigint;
  sbtc: bigint;
}> {
  const response = await fetch(
    `https://api.mainnet.hiro.so/extended/v1/address/${address}/balances`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch balance");
  }

  const data = await response.json() as any;

  return {
    stx: BigInt(data.stx?.balance || "0"),
    sbtc: BigInt(
      data.fungible_tokens?.["SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc"]?.balance || "0"
    ),
  };
}

// Build supply transaction for Zest (returns unsigned tx for signing)
export function buildSupplyTransaction(params: {
  amount: bigint;
  owner: string;
}): {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: string[];
} {
  return {
    contractAddress: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N",
    contractName: "borrow-helper-v2-1-5",
    functionName: "supply",
    functionArgs: [
      ZEST_CONTRACTS.zsbtc,
      ZEST_CONTRACTS.poolReserve,
      ZEST_CONTRACTS.sbtc,
      params.amount.toString(),
      params.owner,
      "none", // referral
      ZEST_CONTRACTS.incentives,
    ],
  };
}

// Build borrow transaction for Zest (returns unsigned tx for signing)
export function buildBorrowTransaction(params: {
  amount: bigint;
  owner: string;
}): {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: string[];
} {
  return {
    contractAddress: "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N",
    contractName: "borrow-helper-v2-1-5",
    functionName: "borrow",
    functionArgs: [
      ZEST_CONTRACTS.poolReserve,
      ZEST_CONTRACTS.sbtcOracle,
      ZEST_CONTRACTS.usdh,
      ZEST_CONTRACTS.zusdh,
      `[{asset: ${ZEST_CONTRACTS.sbtc}, lp-token: ${ZEST_CONTRACTS.zsbtc}, oracle: ${ZEST_CONTRACTS.sbtcOracle}}]`,
      params.amount.toString(),
      ZEST_CONTRACTS.borrowHelper,
      "2", // Variable rate
      params.owner,
      "none", // price feed
    ],
  };
}

// Get current BTC price from oracle or external API
export async function getBtcPrice(): Promise<number> {
  try {
    // Use CoinGecko API
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );
    const data = await response.json() as any;
    return data.bitcoin?.usd || 100000;
  } catch {
    return 100000; // Fallback price
  }
}

// Executor status
export interface ExecutorStatus {
  wallet: {
    address: string;
    stxBalance: string;
    sbtcBalance: string;
    hasSufficientFees: boolean;
  };
  ready: boolean;
  message: string;
}

// Get executor status
export async function getExecutorStatus(): Promise<ExecutorStatus> {
  try {
    const wallet = loadWallet();
    const balance = await getWalletBalance(wallet.mainnetAddress);

    const minFees = 100000n; // 0.1 STX minimum for fees
    const hasSufficientFees = balance.stx >= minFees;

    return {
      wallet: {
        address: wallet.mainnetAddress,
        stxBalance: (Number(balance.stx) / 1_000_000).toFixed(6) + " STX",
        sbtcBalance: (Number(balance.sbtc) / 100_000_000).toFixed(8) + " sBTC",
        hasSufficientFees,
      },
      ready: hasSufficientFees,
      message: hasSufficientFees
        ? "Executor ready - wallet has sufficient fees"
        : "Need more STX for transaction fees",
    };
  } catch (error) {
    return {
      wallet: {
        address: VAULT_OPERATOR_ADDRESS,
        stxBalance: "Unknown",
        sbtcBalance: "Unknown",
        hasSufficientFees: false,
      },
      ready: false,
      message: "Failed to fetch wallet balance",
    };
  }
}
