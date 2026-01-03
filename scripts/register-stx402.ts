/**
 * Register sBTC Yield Vault on stx402.com registry
 * Uses x402-stacks client for proper transaction signing
 */

import { readFileSync } from "fs";
import { X402PaymentClient } from "x402-stacks";
import type { X402PaymentRequired } from "x402-stacks";

// Load wallet
const walletData = JSON.parse(readFileSync("/home/publius/.stacks-wallet.json", "utf-8"));

const REGISTRY_URL = "https://stx402.com/api/registry/register";

const VAULT_ENDPOINTS = [
  {
    url: "https://sbtc-yield-vault.p-d07.workers.dev/deposit",
    name: "sBTC Yield Vault - Deposit",
    description: "Deposit sBTC into leveraged yield vault using looping strategy on Zest Protocol. Returns ~11% APY through 3x leverage.",
    category: "defi",
  },
  {
    url: "https://sbtc-yield-vault.p-d07.workers.dev/withdraw",
    name: "sBTC Yield Vault - Withdraw",
    description: "Withdraw sBTC plus accumulated yield from the vault. Burns vault shares and returns proportional assets.",
    category: "defi",
  },
];

// Create x402 payment client
const paymentClient = new X402PaymentClient({
  network: "mainnet",
  privateKey: walletData.privateKey,
});

async function getPaymentRequired(endpoint: typeof VAULT_ENDPOINTS[0]): Promise<X402PaymentRequired> {
  const response = await fetch(REGISTRY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(endpoint),
  });

  if (response.status !== 402) {
    const text = await response.text();
    throw new Error(`Expected 402, got ${response.status}: ${text}`);
  }

  return response.json();
}

async function registerWithPayment(endpoint: typeof VAULT_ENDPOINTS[0], signedTx: string) {
  const response = await fetch(REGISTRY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": signedTx,
    },
    body: JSON.stringify(endpoint),
  });

  const text = await response.text();
  console.log(`  Response status: ${response.status}`);

  try {
    const result = JSON.parse(text);
    if (response.status !== 200 && response.status !== 201) {
      console.log(`  Response: ${JSON.stringify(result, null, 2)}`);
    }
    return result;
  } catch {
    console.log(`  Response: ${text.slice(0, 300)}`);
    return { error: text };
  }
}

async function main() {
  console.log("=== Registering sBTC Yield Vault on stx402.com ===\n");
  console.log(`Wallet: ${walletData.mainnetAddress}\n`);

  for (const endpoint of VAULT_ENDPOINTS) {
    console.log(`\nRegistering: ${endpoint.name}`);
    console.log(`  URL: ${endpoint.url}`);

    try {
      // Step 1: Get payment requirements
      console.log("  Getting payment requirements...");
      const paymentReq = await getPaymentRequired(endpoint);
      console.log(`  Amount: ${paymentReq.maxAmountRequired} microSTX (${Number(paymentReq.maxAmountRequired) / 1_000_000} STX)`);
      console.log(`  Pay to: ${paymentReq.payTo}`);

      // Step 2: Sign payment using x402-stacks client
      console.log("  Signing payment with x402-stacks client...");
      const signResult = await paymentClient.signPayment(paymentReq);

      if (!signResult.success) {
        console.log(`  ❌ Signing failed: ${signResult.error}`);
        continue;
      }

      console.log(`  Signed tx: ${signResult.signedTransaction.slice(0, 40)}...`);
      console.log(`  Sender: ${signResult.senderAddress}`);

      // Step 3: Submit registration with payment
      console.log("  Submitting registration...");
      const result = await registerWithPayment(endpoint, signResult.signedTransaction);

      if (result.error) {
        console.log(`  ❌ Error: ${result.error}`);
        if (result.details) {
          console.log(`  Details: ${JSON.stringify(result.details)}`);
        }
      } else if (result.success === false) {
        console.log(`  ❌ Failed: ${JSON.stringify(result)}`);
      } else {
        console.log(`  ✅ Registered successfully!`);
        if (result.tx_id) console.log(`  TX: ${result.tx_id}`);
        if (result.endpoint_id) console.log(`  Endpoint ID: ${result.endpoint_id}`);
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${error}`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
