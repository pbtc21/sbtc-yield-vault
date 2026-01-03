/**
 * Test the deposit flow with x402 payment
 */

import { readFileSync } from "fs";
import { X402PaymentClient } from "x402-stacks";
import type { X402PaymentRequired } from "x402-stacks";

// Load wallet
const walletData = JSON.parse(readFileSync("/home/publius/.stacks-wallet.json", "utf-8"));

const VAULT_URL = "https://sbtc-yield-vault.p-d07.workers.dev";

// Create x402 payment client
const paymentClient = new X402PaymentClient({
  network: "mainnet",
  privateKey: walletData.privateKey,
});

async function testDeposit() {
  console.log("=== Testing sBTC Vault Deposit Flow ===\n");
  console.log("Wallet:", walletData.mainnetAddress, "\n");

  const depositAmount = "10000"; // 10,000 sats = 0.0001 BTC

  // Step 1: Make deposit request without payment
  console.log("Step 1: Request deposit without payment...");
  const initialResponse = await fetch(VAULT_URL + "/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: depositAmount,
      sender: walletData.mainnetAddress,
    }),
  });

  console.log("  Status:", initialResponse.status);

  if (initialResponse.status !== 402) {
    const text = await initialResponse.text();
    console.log("  Unexpected response:", text);
    return;
  }

  const paymentReq: X402PaymentRequired = await initialResponse.json();
  console.log("  Got 402 Payment Required");
  console.log("  Amount:", paymentReq.maxAmountRequired, "sats");
  console.log("  Pay to:", paymentReq.payTo);
  console.log("  Token:", paymentReq.tokenType);
  console.log("  Expires:", paymentReq.expiresAt);
  console.log("  Nonce:", paymentReq.nonce);

  // Step 2: Sign the payment
  console.log("\nStep 2: Signing sBTC payment...");
  const signResult = await paymentClient.signPayment(paymentReq);

  if (!signResult.success) {
    console.log("  Signing failed:", signResult.error);
    return;
  }

  console.log("  Payment signed");
  console.log("  Sender:", signResult.senderAddress);
  console.log("  Signed tx:", signResult.signedTransaction.substring(0, 60) + "...");

  // Step 3: Submit deposit with payment
  console.log("\nStep 3: Submitting deposit with payment...");
  const depositResponse = await fetch(VAULT_URL + "/deposit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": signResult.signedTransaction,
    },
    body: JSON.stringify({
      amount: depositAmount,
      sender: walletData.mainnetAddress,
    }),
  });

  console.log("  Status:", depositResponse.status);

  const result = await depositResponse.json();
  console.log("  Response:", JSON.stringify(result, null, 2));

  // Check for X-PAYMENT-RESPONSE header
  const paymentResponse = depositResponse.headers.get("X-PAYMENT-RESPONSE");
  if (paymentResponse) {
    console.log("\n  Payment confirmation:", paymentResponse);
  }

  if (depositResponse.status === 200 || depositResponse.status === 201) {
    console.log("\nDeposit flow completed successfully!");
  } else {
    console.log("\nDeposit failed with status", depositResponse.status);
  }
}

testDeposit().catch(console.error);
