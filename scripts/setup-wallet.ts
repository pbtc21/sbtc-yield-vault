import { generateSecretKey, generateWallet } from "@stacks/wallet-sdk";
import { getAddressFromPrivateKey } from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "fs";

const WALLET_FILE = "/home/publius/.stacks-wallet.json";

async function setupWallet() {
  // Check if wallet already exists
  if (existsSync(WALLET_FILE)) {
    console.log("\n⚠️  Wallet already exists. Loading existing wallet...\n");
    const data = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  EXISTING WALLET ADDRESS (Mainnet)");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`\n  ${data.mainnetAddress}\n`);
    console.log("═══════════════════════════════════════════════════════════\n");
    return;
  }

  // Generate new wallet
  console.log("\n🔐 Generating new Stacks wallet...\n");

  const secretKey = generateSecretKey(256);
  const wallet = await generateWallet({
    secretKey,
    password: "",
  });

  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  // Derive addresses from private key
  const mainnetAddress = getAddressFromPrivateKey(privateKey, STACKS_MAINNET);
  const testnetAddress = getAddressFromPrivateKey(privateKey, STACKS_TESTNET);

  // Display seed phrase ONCE for backup
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🚨 BACKUP YOUR SEED PHRASE NOW - SHOWN ONLY ONCE 🚨");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\n  Write these 24 words down and store them safely:\n");

  const words = secretKey.split(" ");
  for (let i = 0; i < words.length; i += 4) {
    const line = words.slice(i, i + 4)
      .map((w, j) => `${String(i + j + 1).padStart(2)}) ${w.padEnd(10)}`)
      .join("  ");
    console.log(`  ${line}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ⚠️  This seed phrase will NOT be shown again!");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Store wallet (without seed phrase for security)
  const walletData = {
    mainnetAddress,
    testnetAddress,
    // Store private key for signing
    privateKey: privateKey,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(WALLET_FILE, JSON.stringify(walletData, null, 2));
  chmodSync(WALLET_FILE, 0o600); // Only owner can read/write

  console.log("✅ Wallet created and stored securely at ~/.stacks-wallet.json\n");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  YOUR WALLET ADDRESS (Mainnet) - Send STX here:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n  ${mainnetAddress}\n`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Testnet address: ${testnetAddress}`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

setupWallet().catch(console.error);
