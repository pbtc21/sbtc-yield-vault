/**
 * Deploy sBTC Yield Vault using direct API call
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
  console.log("Building vault contract transaction...");

  const tx = await makeContractDeploy({
    contractName: "sbtc-yield-vault",
    codeBody: VAULT_CONTRACT_UPDATED,
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 100000n,
    nonce: 1n,
  });

  const serialized = serializeTransaction(tx);
  console.log("Transaction size:", serialized.length, "bytes");

  // Broadcast using fetch directly with raw bytes
  console.log("\nBroadcasting...");

  const response = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: serialized,
  });

  const text = await response.text();
  console.log("Response status:", response.status);
  console.log("Response:", text);

  if (response.ok) {
    const txId = text.replace(/"/g, "");
    console.log("\n✅ Vault contract deployed!");
    console.log(`TX ID: ${txId}`);
    console.log(`\nExplorer: https://explorer.hiro.so/txid/${txId}?chain=mainnet`);
    console.log(`\nContract: SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault`);
  }
}

main().catch(console.error);
