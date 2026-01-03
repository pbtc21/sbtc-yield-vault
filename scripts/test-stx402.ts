/**
 * Test calling stx402.com with sBTC payment
 */

import { readFileSync } from "fs";
import {
  makeContractCall,
  AnchorMode,
  PostConditionMode,
  uintCV,
  principalCV,
  bufferCV,
  someCV,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

const wallet = JSON.parse(readFileSync("/home/publius/.stacks-wallet.json", "utf-8"));

const SBTC_CONTRACT = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";
const SBTC_NAME = "sbtc-token";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  console.log("Testing stx402.com with sBTC payment...\n");

  // Step 1: Get payment requirements
  console.log("1. Getting payment requirements...");
  const requirementsResponse = await fetch("https://stx402.com/api/ai/dad-joke?tokenType=sBTC");
  const requirements = await requirementsResponse.json() as any;

  console.log("   Amount:", requirements.maxAmountRequired, "sats sBTC");
  console.log("   Pay to:", requirements.payTo);
  console.log("   Nonce:", requirements.nonce);
  console.log("   Expires:", requirements.expiresAt);

  // Step 2: Send sBTC payment
  console.log("\n2. Sending sBTC payment...");

  const amount = BigInt(requirements.maxAmountRequired);
  const recipient = requirements.payTo;
  const memo = Buffer.from(requirements.nonce.substring(0, 34), "utf-8");

  const tx = await makeContractCall({
    contractAddress: SBTC_CONTRACT,
    contractName: SBTC_NAME,
    functionName: "transfer",
    functionArgs: [
      uintCV(amount),
      principalCV(wallet.mainnetAddress),
      principalCV(recipient),
      someCV(bufferCV(memo)),
    ],
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 10000n,
    nonce: 5n,
  });

  const serializedBytes = hexToBytes(serializeTransaction(tx));

  const broadcastResponse = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: serializedBytes,
  });

  const txResult = await broadcastResponse.text();

  if (!broadcastResponse.ok) {
    console.log("   ❌ Payment failed:", txResult);
    return;
  }

  const txId = txResult.replace(/"/g, "");
  console.log("   ✅ Payment sent! TX:", txId);
  console.log("   Explorer: https://explorer.hiro.so/txid/" + txId + "?chain=mainnet");

  // Step 3: Wait for confirmation and call with payment proof
  console.log("\n3. Waiting for confirmation (30s)...");
  await new Promise(r => setTimeout(r, 30000));

  console.log("\n4. Calling endpoint with payment proof...");
  const jokeResponse = await fetch("https://stx402.com/api/ai/dad-joke?tokenType=sBTC", {
    headers: {
      "X-Payment-Proof": txId,
      "X-Payment-Nonce": requirements.nonce,
    },
  });

  const jokeResult = await jokeResponse.json();
  console.log("\n   Response:", JSON.stringify(jokeResult, null, 2));
}

main().catch(console.error);
