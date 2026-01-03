import { readFileSync } from "fs";
import {
  makeContractDeploy,
  AnchorMode,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

// Load wallet
const wallet = JSON.parse(
  readFileSync("/home/publius/.stacks-wallet.json", "utf-8")
);

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  console.log("Deploying sBTC Yield Vault v2...\n");
  console.log("Deployer:", wallet.mainnetAddress);

  // Read contract source
  const contractSource = readFileSync(
    "./contracts/sbtc-yield-vault-v2.clar",
    "utf-8"
  );

  console.log("\nContract size:", contractSource.length, "bytes");

  // Get current nonce
  const nonceResp = await fetch(
    `https://api.mainnet.hiro.so/extended/v1/address/${wallet.mainnetAddress}/nonces`
  );
  const nonceData = (await nonceResp.json()) as any;
  const nonce = BigInt(nonceData.possible_next_nonce);
  console.log("Account nonce:", nonce.toString());

  // Create deployment transaction
  const tx = await makeContractDeploy({
    contractName: "sbtc-loop-vault",
    codeBody: contractSource,
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    clarityVersion: 3,
    fee: 100000n, // 0.1 STX - higher for faster confirmation
    nonce: nonce,
  });

  console.log("\nBroadcasting transaction...");

  // Serialize and broadcast manually
  const serialized = serializeTransaction(tx);
  const bytes = hexToBytes(serialized);

  const broadcastResp = await fetch("https://api.mainnet.hiro.so/v2/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });

  const resultText = await broadcastResp.text();

  if (!broadcastResp.ok) {
    console.error("Deployment failed:", resultText);
    return;
  }

  const result = { txid: resultText.replace(/"/g, "") };

  console.log("\nTransaction broadcast successfully!");
  console.log("TX ID:", result.txid);
  console.log(
    "Explorer:",
    `https://explorer.hiro.so/txid/${result.txid}?chain=mainnet`
  );
  console.log(
    "\nContract will be at:",
    `${wallet.mainnetAddress}.sbtc-loop-vault`
  );

  // Wait for confirmation
  console.log("\nWaiting for confirmation...");
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const txResp = await fetch(
      `https://api.mainnet.hiro.so/extended/v1/tx/${result.txid}`
    );
    const txData = (await txResp.json()) as any;

    if (txData.tx_status === "success") {
      console.log("\nContract deployed successfully!");
      console.log("Block height:", txData.block_height);
      console.log(
        "Contract:",
        `${wallet.mainnetAddress}.sbtc-loop-vault`
      );
      return;
    } else if (txData.tx_status === "abort_by_response") {
      console.error("\nDeployment aborted:", txData.tx_result);
      return;
    }

    process.stdout.write(".");
  }

  console.log("\nTimeout - check explorer for status");
}

main().catch(console.error);
