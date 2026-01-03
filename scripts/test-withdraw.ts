/**
 * Test the withdraw flow via API
 */

import { readFileSync } from "fs";

// Load wallet
const walletData = JSON.parse(readFileSync("/home/publius/.stacks-wallet.json", "utf-8"));

const VAULT_URL = "https://sbtc-yield-vault.p-d07.workers.dev";

async function testWithdraw() {
  console.log("=== Testing sBTC Vault Withdraw Flow ===\n");
  console.log("Wallet:", walletData.mainnetAddress, "\n");

  // Step 1: Check user position first
  console.log("Step 1: Checking current position...");
  const positionResponse = await fetch(
    `${VAULT_URL}/position/${walletData.mainnetAddress}`
  );
  const position = await positionResponse.json();
  console.log("  Position:", JSON.stringify(position, null, 2));

  // Step 2: Check vault stats
  console.log("\nStep 2: Checking vault stats...");
  const statsResponse = await fetch(`${VAULT_URL}/stats`);
  const stats = await statsResponse.json();
  console.log("  Total assets:", stats.totalAssetsBtc, "BTC");
  console.log("  Total shares:", stats.totalShares);
  console.log("  Share price:", stats.sharePrice);

  // Step 3: Request withdraw transaction
  console.log("\nStep 3: Requesting withdraw transaction...");

  // Use actual shares if available, otherwise test with mock amount
  const sharesToWithdraw = position.shares !== "0" ? position.shares : "1000";

  const withdrawResponse = await fetch(VAULT_URL + "/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shares: sharesToWithdraw,
      sender: walletData.mainnetAddress,
    }),
  });

  console.log("  Status:", withdrawResponse.status);

  const result = await withdrawResponse.json();
  console.log("  Response:", JSON.stringify(result, null, 2));

  if (withdrawResponse.status === 200) {
    console.log("\n✅ Withdraw transaction generated!");
    console.log("\nWithdraw details:");
    console.log("  Shares:", result.withdraw?.shares);
    console.log("  Expected assets:", result.withdraw?.expectedAssetsBtc, "BTC");
    console.log("  Min receive:", result.withdraw?.minReceiveBtc, "BTC (1% slippage)");
    console.log("\nTo complete withdrawal:");
    console.log("  1. Sign the transaction with your Stacks wallet");
    console.log("  2. Broadcast to the network");
  } else {
    console.log("\n❌ Withdraw request failed");
  }
}

testWithdraw().catch(console.error);
