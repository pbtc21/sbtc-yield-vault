/**
 * Deploy minimal vault contract to test
 */

import { readFileSync } from "fs";
import {
  makeContractDeploy,
  AnchorMode,
  PostConditionMode,
  serializeTransaction,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

const wallet = JSON.parse(readFileSync("/home/publius/.stacks-wallet.json", "utf-8"));

// Minimal vault contract
const MINIMAL_VAULT = `
;; sBTC Yield Vault - Minimal Version
;; Deployer: SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA

(define-constant CONTRACT_OWNER tx-sender)
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant MAX_TVL u100000000)
(define-constant MANAGEMENT_FEE_BPS u1000)
(define-constant PRECISION u100000000)

(define-constant ERR_UNAUTHORIZED (err u1000))
(define-constant ERR_INVALID_AMOUNT (err u1002))
(define-constant ERR_TVL_CAP_EXCEEDED (err u1004))

(define-fungible-token vault-shares)

(define-data-var vault-paused bool false)
(define-data-var total-assets uint u0)
(define-data-var pending-fees uint u0)

(define-private (calculate-shares-for-deposit (amount uint))
  (let ((total-supply (ft-get-supply vault-shares))
        (assets (var-get total-assets)))
    (if (is-eq total-supply u0)
      amount
      (/ (* amount total-supply) assets))))

(define-private (calculate-assets-for-shares (shares uint))
  (let ((total-supply (ft-get-supply vault-shares))
        (assets (var-get total-assets)))
    (if (is-eq total-supply u0)
      u0
      (/ (* shares assets) total-supply))))

(define-public (deposit (amount uint))
  (let ((sender tx-sender)
        (current-assets (var-get total-assets))
        (shares-to-mint (calculate-shares-for-deposit amount)))
    (asserts! (not (var-get vault-paused)) ERR_UNAUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (<= (+ current-assets amount) MAX_TVL) ERR_TVL_CAP_EXCEEDED)
    (try! (ft-mint? vault-shares shares-to-mint sender))
    (var-set total-assets (+ current-assets amount))
    (print {event: "deposit", user: sender, amount: amount, shares: shares-to-mint})
    (ok shares-to-mint)))

(define-public (withdraw (shares uint))
  (let ((sender tx-sender)
        (user-shares (ft-get-balance vault-shares sender))
        (assets-to-return (calculate-assets-for-shares shares)))
    (asserts! (not (var-get vault-paused)) ERR_UNAUTHORIZED)
    (asserts! (> shares u0) ERR_INVALID_AMOUNT)
    (asserts! (<= shares user-shares) ERR_UNAUTHORIZED)
    (try! (ft-burn? vault-shares shares sender))
    (var-set total-assets (- (var-get total-assets) assets-to-return))
    (print {event: "withdraw", user: sender, shares: shares, assets: assets-to-return})
    (ok assets-to-return)))

(define-read-only (get-share-price)
  (let ((total-supply (ft-get-supply vault-shares))
        (assets (var-get total-assets)))
    (if (is-eq total-supply u0)
      PRECISION
      (/ (* assets PRECISION) total-supply))))

(define-read-only (get-vault-stats)
  {total-assets: (var-get total-assets),
   total-shares: (ft-get-supply vault-shares),
   share-price: (get-share-price),
   tvl-cap: MAX_TVL,
   is-paused: (var-get vault-paused)})

(define-read-only (get-user-shares (user principal))
  (ft-get-balance vault-shares user))

(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set vault-paused paused)
    (ok true)))
`;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  console.log("Deploying minimal vault contract...\n");
  console.log("Deployer:", wallet.mainnetAddress);
  console.log("Contract size:", MINIMAL_VAULT.length, "chars\n");

  const tx = await makeContractDeploy({
    contractName: "sbtc-yield-vault",
    codeBody: MINIMAL_VAULT,
    senderKey: wallet.privateKey,
    network: STACKS_MAINNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 100000n,
    nonce: 1n,
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
    console.log("✅ Success!");
    console.log("TX ID:", txId);
    console.log(`\nExplorer: https://explorer.hiro.so/txid/${txId}?chain=mainnet`);
    console.log(`Contract: SP2QXPFF4M72QYZWXE7S5321XJDJ2DD32DGEMN5QA.sbtc-yield-vault`);
  } else {
    console.log("❌ Failed");
    console.log("Status:", response.status);
    console.log("Response:", text);
  }
}

main().catch(console.error);
