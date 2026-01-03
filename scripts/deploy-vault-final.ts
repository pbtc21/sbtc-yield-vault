/**
 * Deploy sBTC Yield Vault to Stacks Mainnet
 */

import { readFileSync } from "fs";
import {
  makeContractDeploy,
  AnchorMode,
  PostConditionMode,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

// Load wallet
const wallet = JSON.parse(readFileSync("/home/publius/.stacks-wallet.json", "utf-8"));

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

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Deploying sBTC Yield Vault to Mainnet");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("Deployer:", wallet.mainnetAddress);

  // Build the transaction
  const tx = await makeContractDeploy({
    contractName: "sbtc-yield-vault",
    codeBody: VAULT_CONTRACT_UPDATED,
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 200000n, // 0.2 STX for large contract
    nonce: 1n,
  });

  // Serialize returns hex string in this version
  const serializedHex = serializeTransaction(tx);
  const serializedBytes = hexToBytes(serializedHex);

  console.log("Contract size:", VAULT_CONTRACT_UPDATED.length, "chars");
  console.log("TX size:", serializedBytes.length, "bytes");
  console.log("\nBroadcasting...");

  const response = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: serializedBytes,
  });

  const responseText = await response.text();

  if (response.ok) {
    const txId = responseText.replace(/"/g, "");
    console.log("\n✅ Vault contract deployed!");
    console.log("TX ID:", txId);
    console.log(`\nExplorer: https://explorer.hiro.so/txid/${txId}?chain=mainnet`);
    console.log(`\nContract Address: SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault`);
    console.log("═══════════════════════════════════════════════════════════\n");
  } else {
    console.log("\n❌ Deployment failed");
    console.log("Status:", response.status);
    console.log("Response:", responseText);
  }
}

main().catch(console.error);
