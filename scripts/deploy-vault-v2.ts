/**
 * Deploy sBTC Yield Vault using @stacks/transactions
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
  console.log("Building vault contract transaction...\n");

  // Build the transaction
  const tx = await makeContractDeploy({
    contractName: "sbtc-yield-vault",
    codeBody: VAULT_CONTRACT_UPDATED,
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 150000n, // 0.15 STX
    nonce: 1n,
  });

  // Serialize for broadcast
  const serializedBytes = serializeTransaction(tx);

  console.log("Contract size:", VAULT_CONTRACT_UPDATED.length, "chars");
  console.log("TX size:", serializedBytes.length, "bytes\n");

  // Broadcast via Hiro API (using hex format)
  console.log("Broadcasting to mainnet...\n");

  // Convert to Buffer for proper transmission
  const bodyBuffer = Buffer.from(serializedBytes);
  console.log("Buffer length:", bodyBuffer.length, "bytes");

  const response = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": bodyBuffer.length.toString(),
    },
    body: bodyBuffer,
  });

  if (response.ok) {
    const txId = await response.text();
    console.log("✅ Success!");
    console.log("TX ID:", txId.replace(/"/g, ""));
    console.log(`\nExplorer: https://explorer.hiro.so/txid/${txId.replace(/"/g, "")}?chain=mainnet`);
    console.log(`Contract: SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault`);
  } else {
    console.log("❌ Failed");
    console.log("Status:", response.status);
    console.log("Response:", await response.text());

    // Try alternative endpoint
    console.log("\nTrying alternative broadcast method...");

    const response2 = await fetch("https://stacks-node-api.mainnet.stacks.co/v2/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(serializedBytes),
    });

    if (response2.ok) {
      const txId = await response2.text();
      console.log("✅ Success via alternative endpoint!");
      console.log("TX ID:", txId.replace(/"/g, ""));
    } else {
      console.log("Alternative also failed:", await response2.text());
    }
  }
}

main().catch(console.error);
