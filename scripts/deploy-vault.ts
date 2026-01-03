/**
 * Deploy sBTC Yield Vault to Stacks Mainnet
 */

import { readFileSync } from "fs";
import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

// Load wallet
const WALLET_FILE = "/home/publius/.stacks-wallet.json";
const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));

// Load main contract
const VAULT_CONTRACT = readFileSync(
  "/home/publius/dev/personal/sbtc-yield-vault/contracts/sbtc-yield-vault.clar",
  "utf-8"
);

// Update contract to use our deployed trait
const VAULT_CONTRACT_UPDATED = VAULT_CONTRACT.replace(
  "(use-trait sip-010-trait .sip-010-trait.sip-010-trait)",
  `(use-trait sip-010-trait 'SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sip-010-trait.sip-010-trait)`
);

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Deploying sBTC Yield Vault Contract");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\nDeployer: ${wallet.mainnetAddress}`);

  try {
    const tx = await makeContractDeploy({
      contractName: "sbtc-yield-vault",
      codeBody: VAULT_CONTRACT_UPDATED,
      senderKey: wallet.privateKey,
      network: STACKS_MAINNET,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 100000n, // 0.1 STX (higher fee for large contract)
      nonce: 1n, // Increment nonce since we already deployed trait
    });

    console.log("Broadcasting vault contract...");

    const result = await broadcastTransaction({ transaction: tx, network: STACKS_MAINNET });

    if ("error" in result) {
      console.error("Broadcast error:", result.error);
      console.error("Reason:", result.reason);

      // Try to get more details
      if (result.reason_data) {
        console.error("Reason data:", JSON.stringify(result.reason_data, null, 2));
      }
      process.exit(1);
    }

    console.log("\n✅ Vault contract deployed!");
    console.log(`TX ID: ${result.txid}`);
    console.log(`\nExplorer: https://explorer.hiro.so/txid/${result.txid}?chain=mainnet`);
    console.log(`\nContract: SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault`);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
