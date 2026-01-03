/**
 * Test deposit to the vault
 */

import { readFileSync } from "fs";
import {
  makeContractCall,
  AnchorMode,
  PostConditionMode,
  uintCV,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

const wallet = JSON.parse(readFileSync("/home/publius/.stacks-wallet.json", "utf-8"));

// Vault contract
const VAULT_CONTRACT = "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA";
const VAULT_NAME = "sbtc-yield-vault";

// Amount to deposit (1000 sats = 0.00001 BTC)
const DEPOSIT_AMOUNT = 1000n;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  console.log("Testing vault deposit...\n");
  console.log("Wallet:", wallet.mainnetAddress);
  console.log("Deposit amount:", DEPOSIT_AMOUNT.toString(), "sats");
  console.log("Vault:", `${VAULT_CONTRACT}.${VAULT_NAME}\n`);

  // Build deposit transaction
  const tx = await makeContractCall({
    contractAddress: VAULT_CONTRACT,
    contractName: VAULT_NAME,
    functionName: "deposit",
    functionArgs: [uintCV(DEPOSIT_AMOUNT)],
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 10000n, // 0.01 STX
    nonce: 2n, // After trait + vault deployment
  });

  const serializedHex = serializeTransaction(tx);
  const serializedBytes = hexToBytes(serializedHex);

  console.log("TX size:", serializedBytes.length, "bytes");
  console.log("Broadcasting...\n");

  const response = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: serializedBytes,
  });

  const text = await response.text();

  if (response.ok) {
    const txId = text.replace(/"/g, "");
    console.log("✅ Deposit transaction submitted!");
    console.log("TX ID:", txId);
    console.log(`\nExplorer: https://explorer.hiro.so/txid/${txId}?chain=mainnet`);
    console.log("\nWait ~10-30 seconds for confirmation, then check:");
    console.log("curl https://sbtc-yield-vault.p-d07.workers.dev/stats");
  } else {
    console.log("❌ Failed");
    console.log("Status:", response.status);
    console.log("Response:", text);
  }
}

main().catch(console.error);
