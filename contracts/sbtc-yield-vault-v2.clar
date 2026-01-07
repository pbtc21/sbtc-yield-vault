;; sBTC Yield Vault v2
;; Simplified version for mainnet deployment
;; Operator manages sBTC manually, vault tracks shares and yields

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant CONTRACT_OWNER tx-sender)
(define-constant MAX_TVL u100000000)
(define-constant MANAGEMENT_FEE_BPS u1000)
(define-constant PRECISION u100000000)
(define-constant MIN_DEPOSIT u10000)

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u1000))
(define-constant ERR_VAULT_PAUSED (err u1001))
(define-constant ERR_INVALID_AMOUNT (err u1002))
(define-constant ERR_INSUFFICIENT_SHARES (err u1003))
(define-constant ERR_TVL_EXCEEDED (err u1004))
(define-constant ERR_ZERO_SHARES (err u1006))
(define-constant ERR_BELOW_MINIMUM (err u1007))
(define-constant ERR_WITHDRAWAL_LOCKED (err u1008))
(define-constant ERR_INSUFFICIENT_LIQUIDITY (err u1009))

;; ============================================
;; FUNGIBLE TOKEN (Vault Shares)
;; ============================================

(define-fungible-token vault-shares)

;; ============================================
;; DATA VARIABLES
;; ============================================

(define-data-var vault-paused bool false)
(define-data-var total-sbtc-deposited uint u0)
(define-data-var total-sbtc-deployed uint u0)
(define-data-var total-usdh-borrowed uint u0)
(define-data-var pending-operator-fees uint u0)
(define-data-var last-harvest-height uint u0)
(define-data-var withdrawal-delay-blocks uint u144)

;; ============================================
;; DATA MAPS
;; ============================================

(define-map user-deposits
  principal
  {
    initial-deposit: uint,
    deposit-height: uint,
    last-action-height: uint,
  }
)

(define-map pending-withdrawals
  principal
  {
    shares: uint,
    request-height: uint,
  }
)

;; ============================================
;; PRIVATE FUNCTIONS
;; ============================================

(define-private (get-total-assets)
  (+ (var-get total-sbtc-deposited) (var-get total-sbtc-deployed))
)

(define-private (calc-shares-for-deposit (amount uint))
  (let (
      (total-supply (ft-get-supply vault-shares))
      (assets (get-total-assets))
    )
    (if (is-eq total-supply u0)
      amount
      (/ (* amount total-supply) assets)
    )
  )
)

(define-private (calc-assets-for-shares (shares uint))
  (let (
      (total-supply (ft-get-supply vault-shares))
      (assets (get-total-assets))
    )
    (if (is-eq total-supply u0)
      u0
      (/ (* shares assets) total-supply)
    )
  )
)

(define-private (is-owner)
  (is-eq tx-sender CONTRACT_OWNER)
)

;; ============================================
;; OPERATOR FUNCTIONS
;; ============================================

;; Record a deposit (operator calls after receiving sBTC)
(define-public (record-deposit (user principal) (amount uint))
  (let (
      (shares-to-mint (calc-shares-for-deposit amount))
      (current-deposited (var-get total-sbtc-deposited))
    )
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (asserts! (not (var-get vault-paused)) ERR_VAULT_PAUSED)
    (asserts! (>= amount MIN_DEPOSIT) ERR_BELOW_MINIMUM)
    (asserts! (> shares-to-mint u0) ERR_ZERO_SHARES)
    (asserts! (<= (+ (get-total-assets) amount) MAX_TVL) ERR_TVL_EXCEEDED)

    (try! (ft-mint? vault-shares shares-to-mint user))
    (var-set total-sbtc-deposited (+ current-deposited amount))

    (map-set user-deposits user {
      initial-deposit: (+ amount (default-to u0 (get initial-deposit (map-get? user-deposits user)))),
      deposit-height: stacks-block-height,
      last-action-height: stacks-block-height,
    })

    (print {
      event: "deposit",
      user: user,
      amount: amount,
      shares-minted: shares-to-mint,
      share-price: (get-share-price),
    })

    (ok shares-to-mint)
  )
)

;; Record a withdrawal (operator calls after sending sBTC)
(define-public (record-withdrawal (user principal) (shares uint))
  (let (
      (assets-returned (calc-assets-for-shares shares))
      (current-deposited (var-get total-sbtc-deposited))
    )
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (asserts! (not (var-get vault-paused)) ERR_VAULT_PAUSED)
    (asserts! (> shares u0) ERR_INVALID_AMOUNT)
    (asserts! (> assets-returned u0) ERR_ZERO_SHARES)

    (try! (ft-burn? vault-shares shares user))
    (var-set total-sbtc-deposited (- current-deposited assets-returned))

    (print {
      event: "withdrawal",
      user: user,
      shares-burned: shares,
      sbtc-returned: assets-returned,
    })

    (ok assets-returned)
  )
)

;; Deploy sBTC to strategy
(define-public (deploy-to-strategy (amount uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (asserts! (<= amount (var-get total-sbtc-deposited)) ERR_INSUFFICIENT_LIQUIDITY)

    (var-set total-sbtc-deposited (- (var-get total-sbtc-deposited) amount))
    (var-set total-sbtc-deployed (+ (var-get total-sbtc-deployed) amount))

    (print {
      event: "deployed-to-strategy",
      amount: amount,
      total-deployed: (var-get total-sbtc-deployed),
    })

    (ok true)
  )
)

;; Return from strategy
(define-public (return-from-strategy (amount uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)

    (var-set total-sbtc-deposited (+ (var-get total-sbtc-deposited) amount))
    (var-set total-sbtc-deployed (- (var-get total-sbtc-deployed) amount))

    (print {
      event: "returned-from-strategy",
      amount: amount,
      vault-balance: (var-get total-sbtc-deposited),
    })

    (ok true)
  )
)

;; Report yield from strategy
(define-public (report-yield (gross-yield uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)

    (let (
        (operator-fee (/ (* gross-yield MANAGEMENT_FEE_BPS) u10000))
        (net-yield (- gross-yield operator-fee))
      )
      (var-set total-sbtc-deployed (+ (var-get total-sbtc-deployed) net-yield))
      (var-set pending-operator-fees (+ (var-get pending-operator-fees) operator-fee))
      (var-set last-harvest-height stacks-block-height)

      (print {
        event: "yield-reported",
        gross-yield: gross-yield,
        operator-fee: operator-fee,
        net-yield: net-yield,
        new-share-price: (get-share-price),
      })

      (ok net-yield)
    )
  )
)

;; Update debt tracking
(define-public (update-debt (usdh-amount uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (var-set total-usdh-borrowed usdh-amount)
    (ok true)
  )
)

;; Claim fees
(define-public (claim-operator-fees (amount uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (asserts! (<= amount (var-get pending-operator-fees)) ERR_INSUFFICIENT_LIQUIDITY)

    (var-set pending-operator-fees (- (var-get pending-operator-fees) amount))

    (print { event: "fees-claimed", amount: amount })
    (ok amount)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (var-set vault-paused paused)
    (print { event: "vault-paused", paused: paused })
    (ok true)
  )
)

(define-public (set-withdrawal-delay (blocks uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (var-set withdrawal-delay-blocks blocks)
    (ok true)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-share-price)
  (let (
      (total-supply (ft-get-supply vault-shares))
      (assets (get-total-assets))
    )
    (if (is-eq total-supply u0)
      PRECISION
      (/ (* assets PRECISION) total-supply)
    )
  )
)

(define-read-only (get-vault-stats)
  {
    total-assets: (get-total-assets),
    liquid-balance: (var-get total-sbtc-deposited),
    deployed-balance: (var-get total-sbtc-deployed),
    total-shares: (ft-get-supply vault-shares),
    share-price: (get-share-price),
    usdh-debt: (var-get total-usdh-borrowed),
    tvl-cap: MAX_TVL,
    tvl-remaining: (- MAX_TVL (get-total-assets)),
    pending-fees: (var-get pending-operator-fees),
    is-paused: (var-get vault-paused),
    withdrawal-delay: (var-get withdrawal-delay-blocks),
  }
)

(define-read-only (get-position (user principal))
  (let (
      (shares (ft-get-balance vault-shares user))
      (deposit-info (map-get? user-deposits user))
      (pending (map-get? pending-withdrawals user))
    )
    {
      shares: shares,
      assets-value: (calc-assets-for-shares shares),
      initial-deposit: (default-to u0 (get initial-deposit deposit-info)),
      deposit-height: (default-to u0 (get deposit-height deposit-info)),
      pending-withdrawal: (default-to { shares: u0, request-height: u0 } pending),
    }
  )
)

(define-read-only (get-user-shares (user principal))
  (ft-get-balance vault-shares user)
)

(define-read-only (get-estimated-apy)
  u1100
)

;; ============================================
;; SIP-010 IMPLEMENTATION (Vault Shares)
;; ============================================

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR_UNAUTHORIZED)
    (try! (ft-transfer? vault-shares amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

(define-read-only (get-name)
  (ok "sBTC Yield Vault Shares v2")
)

(define-read-only (get-symbol)
  (ok "yvsBTC")
)

(define-read-only (get-decimals)
  (ok u8)
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance vault-shares who))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply vault-shares))
)

(define-read-only (get-token-uri)
  (ok (some u"https://vault.pbtc21.dev/token-metadata.json"))
)
