/**
 * Test withdraw from the vault
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

const VAULT_CONTRACT = "SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA";
const VAULT_NAME = "sbtc-yield-vault";

// Withdraw 500 shares (half position)
const WITHDRAW_SHARES = 500n;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  console.log("Testing vault withdraw...\n");
  console.log("Wallet:", wallet.mainnetAddress);
  console.log("Withdraw shares:", WITHDRAW_SHARES.toString());
  console.log("Vault:", `${VAULT_CONTRACT}.${VAULT_NAME}\n`);

  const tx = await makeContractCall({
    contractAddress: VAULT_CONTRACT,
    contractName: VAULT_NAME,
    functionName: "withdraw",
    functionArgs: [uintCV(WITHDRAW_SHARES)],
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 10000n,
    nonce: 3n,
  });

  const serializedHex = serializeTransaction(tx);
  const serializedBytes = hexToBytes(serializedHex);

  console.log("Broadcasting...\n");

  const response = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: serializedBytes,
  });

  const text = await response.text();

  if (response.ok) {
    const txId = text.replace(/"/g, "");
    console.log("✅ Withdraw transaction submitted!");
    console.log("TX ID:", txId);
    console.log(`\nExplorer: https://explorer.hiro.so/txid/${txId}?chain=mainnet`);
  } else {
    console.log("❌ Failed");
    console.log("Status:", response.status);
    console.log("Response:", text);
  }
}

main().catch(console.error);
