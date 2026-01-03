/**
 * Debug transaction serialization
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

async function main() {
  console.log("Building simple test transaction...\n");

  const tx = await makeContractDeploy({
    contractName: "test-contract",
    codeBody: "(define-public (hello) (ok true))",
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
    nonce: 2n,
  });

  const serialized = serializeTransaction(tx);

  console.log("Serialized type:", typeof serialized);
  console.log("Is Uint8Array:", serialized instanceof Uint8Array);
  console.log("Length:", serialized.length);
  console.log("First 20 bytes (hex):", Buffer.from(serialized.slice(0, 20)).toString("hex"));
  console.log("First 20 bytes (raw):", Array.from(serialized.slice(0, 20)));

  // Check if it's actually a string disguised as array
  console.log("\nByte values at start:");
  for (let i = 0; i < 10; i++) {
    console.log(`  [${i}] = ${serialized[i]} (char: ${String.fromCharCode(serialized[i])})`);
  }

  // Try broadcasting
  console.log("\nAttempting broadcast...");
  const response = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: serialized,
  });

  console.log("Status:", response.status);
  console.log("Response:", await response.text());
}

main().catch(console.error);
