/**
 * Deploy sBTC Yield Vault to Stacks Mainnet
 */

import { readFileSync } from "fs";
import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

// Load wallet
const WALLET_FILE = "/home/publius/.stacks-wallet.json";
const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));

// SIP-010 Trait (must be deployed first)
const SIP_010_TRAIT = `
;; SIP-010 Fungible Token Trait
(define-trait sip-010-trait
  (
    ;; Transfer
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    ;; Get balance
    (get-balance (principal) (response uint uint))
    ;; Get total supply
    (get-total-supply () (response uint uint))
    ;; Get name
    (get-name () (response (string-ascii 32) uint))
    ;; Get symbol
    (get-symbol () (response (string-ascii 32) uint))
    ;; Get decimals
    (get-decimals () (response uint uint))
    ;; Get token URI
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)
`;

// Load main contract
const VAULT_CONTRACT = readFileSync(
  "/home/publius/dev/personal/sbtc-yield-vault/contracts/sbtc-yield-vault.clar",
  "utf-8"
);

// Update contract to use our deployed trait
const VAULT_CONTRACT_UPDATED = VAULT_CONTRACT.replace(
  "(use-trait sip-010-trait .sip-010-trait.sip-010-trait)",
  `(use-trait sip-010-trait '${wallet.mainnetAddress}.sip-010-trait.sip-010-trait)`
);

async function deployContract(
  contractName: string,
  codeBody: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  console.log(`\nDeploying ${contractName}...`);

  try {
    const tx = await makeContractDeploy({
      contractName,
      codeBody,
      senderKey: wallet.privateKey,
      network: STACKS_MAINNET,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 50000n, // 0.05 STX
    });

    console.log(`Broadcasting ${contractName}...`);
    const result = await broadcastTransaction({ transaction: tx, network: STACKS_MAINNET });

    if ("error" in result) {
      console.error(`Failed to deploy ${contractName}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`✓ ${contractName} deployed: ${result.txid}`);
    return { success: true, txId: result.txid };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error deploying ${contractName}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  sBTC Yield Vault - Mainnet Deployment");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\nDeployer: ${wallet.mainnetAddress}`);

  // Check balance first
  const balanceResponse = await fetch(
    `https://api.mainnet.hiro.so/extended/v1/address/${wallet.mainnetAddress}/balances`
  );
  const balanceData = (await balanceResponse.json()) as any;
  const stxBalance = Number(balanceData.stx?.balance || 0) / 1_000_000;

  console.log(`STX Balance: ${stxBalance.toFixed(6)} STX`);

  if (stxBalance < 0.15) {
    console.error("\n❌ Insufficient STX for deployment (need ~0.15 STX for both contracts)");
    process.exit(1);
  }

  // Step 1: Deploy SIP-010 trait
  console.log("\n--- Step 1: Deploy SIP-010 Trait ---");
  const traitResult = await deployContract("sip-010-trait", SIP_010_TRAIT);

  if (!traitResult.success) {
    console.error("\n❌ Failed to deploy trait. Aborting.");
    process.exit(1);
  }

  // Wait for trait deployment to be processed
  console.log("\nWaiting 30 seconds for trait deployment to propagate...");
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Step 2: Deploy main vault contract
  console.log("\n--- Step 2: Deploy Vault Contract ---");
  const vaultResult = await deployContract("sbtc-yield-vault", VAULT_CONTRACT_UPDATED);

  if (!vaultResult.success) {
    console.error("\n❌ Failed to deploy vault contract.");
    process.exit(1);
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Deployment Complete!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\nSIP-010 Trait: ${wallet.mainnetAddress}.sip-010-trait`);
  console.log(`Vault Contract: ${wallet.mainnetAddress}.sbtc-yield-vault`);
  console.log(`\nTrait TX: https://explorer.hiro.so/txid/${traitResult.txId}?chain=mainnet`);
  console.log(`Vault TX: https://explorer.hiro.so/txid/${vaultResult.txId}?chain=mainnet`);
  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
