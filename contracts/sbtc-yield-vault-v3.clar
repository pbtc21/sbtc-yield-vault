;; sBTC Yield Vault v3
;; SECURE version with direct sBTC custody, liquidation protection, and emergency controls
;; Strategy: Deposit sBTC → Borrow USDh (BSD) → Swap to sBTC → Compound

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant CONTRACT_OWNER tx-sender)
(define-constant VAULT_PRINCIPAL (as-contract tx-sender))
(define-constant MAX_TVL u100000000) ;; 1 BTC
(define-constant MANAGEMENT_FEE_BPS u1000) ;; 10%
(define-constant PRECISION u100000000) ;; 8 decimals
(define-constant MIN_DEPOSIT u10000) ;; 0.0001 BTC
(define-constant MAX_LTV_BPS u7000) ;; 70% max loan-to-value
(define-constant LIQUIDATION_THRESHOLD_BPS u8000) ;; 80% - start de-leveraging
(define-constant EMERGENCY_THRESHOLD_BPS u8500) ;; 85% - emergency mode
(define-constant WITHDRAWAL_DELAY_BLOCKS u144) ;; ~24 hours
(define-constant MIN_HEALTH_FACTOR u12000) ;; 1.2x minimum (in BPS * 10)

;; Error codes - grouped by category
(define-constant ERR_UNAUTHORIZED (err u1000))
(define-constant ERR_VAULT_PAUSED (err u1001))
(define-constant ERR_INVALID_AMOUNT (err u1002))
(define-constant ERR_INSUFFICIENT_SHARES (err u1003))
(define-constant ERR_TVL_EXCEEDED (err u1004))
(define-constant ERR_TRANSFER_FAILED (err u1005))
(define-constant ERR_ZERO_SHARES (err u1006))
(define-constant ERR_BELOW_MINIMUM (err u1007))
(define-constant ERR_WITHDRAWAL_LOCKED (err u1008))
(define-constant ERR_INSUFFICIENT_LIQUIDITY (err u1009))
(define-constant ERR_HEALTH_TOO_LOW (err u1010))
(define-constant ERR_SLIPPAGE_EXCEEDED (err u1011))
(define-constant ERR_EMERGENCY_MODE (err u1012))
(define-constant ERR_COOLDOWN_ACTIVE (err u1013))
(define-constant ERR_MAX_LOSS_EXCEEDED (err u1014))

;; ============================================
;; SIP-010 TOKEN TRAITS
;; ============================================

;; Reference sBTC token
(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
    (get-decimals () (response uint uint))
  )
)

;; ============================================
;; FUNGIBLE TOKEN (Vault Shares)
;; ============================================

(define-fungible-token vault-shares)

;; ============================================
;; DATA VARIABLES
;; ============================================

;; Vault state
(define-data-var vault-paused bool false)
(define-data-var emergency-mode bool false)
(define-data-var total-sbtc-balance uint u0) ;; Actual sBTC held
(define-data-var total-sbtc-deployed uint u0) ;; sBTC in Zest
(define-data-var total-usdh-debt uint u0) ;; Outstanding USDh borrowed
(define-data-var pending-operator-fees uint u0)
(define-data-var last-harvest-block uint u0)
(define-data-var current-btc-price uint u10000000000) ;; $100k default (6 decimals)
(define-data-var current-health-factor uint u20000) ;; 2.0x default (BPS * 10)

;; Keepers and permissions
(define-data-var keeper-address (optional principal) none)
(define-data-var price-oracle (optional principal) none)

;; ============================================
;; DATA MAPS
;; ============================================

(define-map user-deposits
  principal
  {
    initial-deposit: uint,
    deposit-height: uint,
    last-action-height: uint,
    max-loss-bps: uint, ;; User's max acceptable loss (default 500 = 5%)
  }
)

(define-map withdrawal-requests
  principal
  {
    shares: uint,
    request-height: uint,
    min-receive: uint, ;; Slippage protection
  }
)

(define-map whitelisted-keepers principal bool)

;; ============================================
;; PRIVATE FUNCTIONS
;; ============================================

(define-private (get-total-assets)
  (+ (var-get total-sbtc-balance) (var-get total-sbtc-deployed))
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

(define-private (is-keeper)
  (or (is-owner) (default-to false (map-get? whitelisted-keepers tx-sender)))
)

;; Calculate health factor: collateral_value / debt_value
;; Returns in BPS * 10 (so 20000 = 2.0x health factor)
(define-private (calculate-health-factor)
  (let (
      (deployed (var-get total-sbtc-deployed))
      (debt (var-get total-usdh-debt))
      (btc-price (var-get current-btc-price))
    )
    (if (is-eq debt u0)
      u100000 ;; No debt = infinite health
      (let (
          ;; Collateral in USD (6 decimals) = deployed sats * btc_price / 100M
          (collateral-usd (/ (* deployed btc-price) u100000000))
          ;; Debt in USD (6 decimals)
          (debt-usd (/ debt u1000000))
        )
        (if (is-eq debt-usd u0)
          u100000
          ;; Health = collateral / debt * 10000 (BPS * 10)
          (/ (* collateral-usd u10000) debt-usd)
        )
      )
    )
  )
)

(define-private (check-health-safe)
  (>= (calculate-health-factor) MIN_HEALTH_FACTOR)
)

;; ============================================
;; PUBLIC FUNCTIONS - USER DEPOSITS
;; ============================================

;; Direct deposit - User sends sBTC, receives vault shares
(define-public (deposit (amount uint) (max-loss-bps uint))
  (let (
      (shares-to-mint (calc-shares-for-deposit amount))
      (sender tx-sender)
    )
    ;; Validation
    (asserts! (not (var-get vault-paused)) ERR_VAULT_PAUSED)
    (asserts! (not (var-get emergency-mode)) ERR_EMERGENCY_MODE)
    (asserts! (>= amount MIN_DEPOSIT) ERR_BELOW_MINIMUM)
    (asserts! (> shares-to-mint u0) ERR_ZERO_SHARES)
    (asserts! (<= (+ (get-total-assets) amount) MAX_TVL) ERR_TVL_EXCEEDED)
    (asserts! (<= max-loss-bps u1000) ERR_INVALID_AMOUNT) ;; Max 10% loss tolerance

    ;; Transfer sBTC from user to vault
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      transfer amount sender VAULT_PRINCIPAL none))

    ;; Mint shares
    (try! (ft-mint? vault-shares shares-to-mint sender))
    (var-set total-sbtc-balance (+ (var-get total-sbtc-balance) amount))

    ;; Record deposit
    (map-set user-deposits sender {
      initial-deposit: (+ amount (default-to u0 (get initial-deposit (map-get? user-deposits sender)))),
      deposit-height: stacks-block-height,
      last-action-height: stacks-block-height,
      max-loss-bps: max-loss-bps,
    })

    (print {
      event: "deposit",
      user: sender,
      amount: amount,
      shares-minted: shares-to-mint,
      share-price: (get-share-price),
    })

    (ok shares-to-mint)
  )
)

;; Request withdrawal - Initiates cooldown period
(define-public (request-withdrawal (shares uint) (min-receive uint))
  (let (
      (sender tx-sender)
      (user-shares (ft-get-balance vault-shares sender))
      (expected-assets (calc-assets-for-shares shares))
    )
    ;; Validation
    (asserts! (not (var-get vault-paused)) ERR_VAULT_PAUSED)
    (asserts! (> shares u0) ERR_INVALID_AMOUNT)
    (asserts! (<= shares user-shares) ERR_INSUFFICIENT_SHARES)
    (asserts! (<= min-receive expected-assets) ERR_SLIPPAGE_EXCEEDED)

    ;; Check no existing pending withdrawal
    (asserts! (is-none (map-get? withdrawal-requests sender)) ERR_COOLDOWN_ACTIVE)

    ;; Record withdrawal request
    (map-set withdrawal-requests sender {
      shares: shares,
      request-height: stacks-block-height,
      min-receive: min-receive,
    })

    (print {
      event: "withdrawal-requested",
      user: sender,
      shares: shares,
      expected-assets: expected-assets,
      min-receive: min-receive,
      unlock-height: (+ stacks-block-height WITHDRAWAL_DELAY_BLOCKS),
    })

    (ok expected-assets)
  )
)

;; Complete withdrawal - After cooldown period
(define-public (complete-withdrawal)
  (let (
      (sender tx-sender)
      (request (unwrap! (map-get? withdrawal-requests sender) ERR_INVALID_AMOUNT))
      (shares (get shares request))
      (min-receive (get min-receive request))
      (request-height (get request-height request))
      (assets-to-return (calc-assets-for-shares shares))
    )
    ;; Validation
    (asserts! (>= stacks-block-height (+ request-height WITHDRAWAL_DELAY_BLOCKS)) ERR_WITHDRAWAL_LOCKED)
    (asserts! (>= assets-to-return min-receive) ERR_SLIPPAGE_EXCEEDED)
    (asserts! (<= assets-to-return (var-get total-sbtc-balance)) ERR_INSUFFICIENT_LIQUIDITY)

    ;; Check max loss protection
    (let (
        (user-info (map-get? user-deposits sender))
        (initial (default-to u0 (get initial-deposit user-info)))
        (max-loss (default-to u500 (get max-loss-bps user-info)))
      )
      (if (> initial u0)
        (let ((loss-bps (if (< assets-to-return initial)
                          (/ (* (- initial assets-to-return) u10000) initial)
                          u0)))
          (asserts! (<= loss-bps max-loss) ERR_MAX_LOSS_EXCEEDED)
          true
        )
        true
      )
    )

    ;; Burn shares
    (try! (ft-burn? vault-shares shares sender))

    ;; Transfer sBTC to user
    (try! (as-contract (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      transfer assets-to-return VAULT_PRINCIPAL sender none)))

    ;; Update state
    (var-set total-sbtc-balance (- (var-get total-sbtc-balance) assets-to-return))
    (map-delete withdrawal-requests sender)

    (print {
      event: "withdrawal-completed",
      user: sender,
      shares-burned: shares,
      sbtc-returned: assets-to-return,
    })

    (ok assets-to-return)
  )
)

;; Emergency withdrawal - Skip cooldown, accept current price
(define-public (emergency-withdraw)
  (let (
      (sender tx-sender)
      (shares (ft-get-balance vault-shares sender))
      (assets-to-return (calc-assets-for-shares shares))
    )
    ;; Only available in emergency mode or if health is critical
    (asserts! (or (var-get emergency-mode) (< (calculate-health-factor) MIN_HEALTH_FACTOR)) ERR_UNAUTHORIZED)
    (asserts! (> shares u0) ERR_INVALID_AMOUNT)
    (asserts! (<= assets-to-return (var-get total-sbtc-balance)) ERR_INSUFFICIENT_LIQUIDITY)

    ;; Burn shares
    (try! (ft-burn? vault-shares shares sender))

    ;; Transfer sBTC (user accepts current value)
    (try! (as-contract (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      transfer assets-to-return VAULT_PRINCIPAL sender none)))

    ;; Update state
    (var-set total-sbtc-balance (- (var-get total-sbtc-balance) assets-to-return))
    (map-delete withdrawal-requests sender)

    (print {
      event: "emergency-withdrawal",
      user: sender,
      shares-burned: shares,
      sbtc-returned: assets-to-return,
    })

    (ok assets-to-return)
  )
)

;; ============================================
;; KEEPER FUNCTIONS - Strategy Execution
;; ============================================

;; Deploy sBTC to Zest (keeper only)
(define-public (deploy-to-zest (amount uint))
  (begin
    (asserts! (is-keeper) ERR_UNAUTHORIZED)
    (asserts! (not (var-get emergency-mode)) ERR_EMERGENCY_MODE)
    (asserts! (<= amount (var-get total-sbtc-balance)) ERR_INSUFFICIENT_LIQUIDITY)
    (asserts! (check-health-safe) ERR_HEALTH_TOO_LOW)

    ;; Update accounting (actual Zest call happens off-chain)
    (var-set total-sbtc-balance (- (var-get total-sbtc-balance) amount))
    (var-set total-sbtc-deployed (+ (var-get total-sbtc-deployed) amount))

    (print {
      event: "deployed-to-zest",
      amount: amount,
      total-deployed: (var-get total-sbtc-deployed),
      health-factor: (calculate-health-factor),
    })

    (ok true)
  )
)

;; Record borrow against collateral (keeper tracks debt)
(define-public (record-borrow (usdh-amount uint))
  (begin
    (asserts! (is-keeper) ERR_UNAUTHORIZED)
    (asserts! (not (var-get emergency-mode)) ERR_EMERGENCY_MODE)

    (var-set total-usdh-debt (+ (var-get total-usdh-debt) usdh-amount))

    ;; Check health after borrow
    (asserts! (check-health-safe) ERR_HEALTH_TOO_LOW)

    (print {
      event: "borrow-recorded",
      amount: usdh-amount,
      total-debt: (var-get total-usdh-debt),
      health-factor: (calculate-health-factor),
    })

    (ok true)
  )
)

;; Record repayment (reduces debt)
(define-public (record-repay (usdh-amount uint))
  (begin
    (asserts! (is-keeper) ERR_UNAUTHORIZED)

    (var-set total-usdh-debt (- (var-get total-usdh-debt) (min usdh-amount (var-get total-usdh-debt))))

    (print {
      event: "repay-recorded",
      amount: usdh-amount,
      total-debt: (var-get total-usdh-debt),
      health-factor: (calculate-health-factor),
    })

    (ok true)
  )
)

;; Record yield from strategy
(define-public (report-yield (gross-yield uint))
  (begin
    (asserts! (is-keeper) ERR_UNAUTHORIZED)

    (let (
        (operator-fee (/ (* gross-yield MANAGEMENT_FEE_BPS) u10000))
        (net-yield (- gross-yield operator-fee))
      )
      (var-set total-sbtc-deployed (+ (var-get total-sbtc-deployed) net-yield))
      (var-set pending-operator-fees (+ (var-get pending-operator-fees) operator-fee))
      (var-set last-harvest-block stacks-block-height)

      (print {
        event: "yield-reported",
        gross-yield: gross-yield,
        operator-fee: operator-fee,
        net-yield: net-yield,
        new-share-price: (get-share-price),
        health-factor: (calculate-health-factor),
      })

      (ok net-yield)
    )
  )
)

;; De-leverage if health is too low
(define-public (deleverage (amount-to-repay uint))
  (begin
    (asserts! (is-keeper) ERR_UNAUTHORIZED)

    ;; Should only deleverage when health is concerning
    (asserts! (< (calculate-health-factor) u15000) ERR_UNAUTHORIZED) ;; Below 1.5x

    ;; Record the deleveraging
    (var-set total-usdh-debt (- (var-get total-usdh-debt) (min amount-to-repay (var-get total-usdh-debt))))

    (print {
      event: "deleveraged",
      amount-repaid: amount-to-repay,
      new-debt: (var-get total-usdh-debt),
      new-health-factor: (calculate-health-factor),
    })

    (ok (calculate-health-factor))
  )
)

;; Update BTC price from oracle
(define-public (update-price (new-price uint))
  (begin
    (asserts! (or (is-keeper) (is-eq (some tx-sender) (var-get price-oracle))) ERR_UNAUTHORIZED)
    (asserts! (> new-price u0) ERR_INVALID_AMOUNT)

    (var-set current-btc-price new-price)
    (var-set current-health-factor (calculate-health-factor))

    ;; Check if we need emergency mode
    (if (< (calculate-health-factor) MIN_HEALTH_FACTOR)
      (var-set emergency-mode true)
      true
    )

    (print {
      event: "price-updated",
      new-price: new-price,
      health-factor: (calculate-health-factor),
      emergency-mode: (var-get emergency-mode),
    })

    (ok true)
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

(define-public (set-emergency-mode (emergency bool))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (var-set emergency-mode emergency)
    (print { event: "emergency-mode", enabled: emergency })
    (ok true)
  )
)

(define-public (add-keeper (keeper principal))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (map-set whitelisted-keepers keeper true)
    (ok true)
  )
)

(define-public (remove-keeper (keeper principal))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (map-delete whitelisted-keepers keeper)
    (ok true)
  )
)

(define-public (set-price-oracle (oracle principal))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (var-set price-oracle (some oracle))
    (ok true)
  )
)

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
    liquid-balance: (var-get total-sbtc-balance),
    deployed-balance: (var-get total-sbtc-deployed),
    total-shares: (ft-get-supply vault-shares),
    share-price: (get-share-price),
    usdh-debt: (var-get total-usdh-debt),
    health-factor: (calculate-health-factor),
    btc-price: (var-get current-btc-price),
    tvl-cap: MAX_TVL,
    tvl-remaining: (- MAX_TVL (get-total-assets)),
    pending-fees: (var-get pending-operator-fees),
    is-paused: (var-get vault-paused),
    emergency-mode: (var-get emergency-mode),
    last-harvest: (var-get last-harvest-block),
  }
)

(define-read-only (get-position (user principal))
  (let (
      (shares (ft-get-balance vault-shares user))
      (deposit-info (map-get? user-deposits user))
      (pending (map-get? withdrawal-requests user))
      (assets (calc-assets-for-shares shares))
      (initial (default-to u0 (get initial-deposit deposit-info)))
    )
    {
      shares: shares,
      assets-value: assets,
      initial-deposit: initial,
      profit-loss: (if (> assets initial) (- assets initial) u0),
      profit-loss-bps: (if (> initial u0) (/ (* (if (> assets initial) (- assets initial) (- initial assets)) u10000) initial) u0),
      is-profit: (>= assets initial),
      deposit-height: (default-to u0 (get deposit-height deposit-info)),
      max-loss-bps: (default-to u500 (get max-loss-bps deposit-info)),
      pending-withdrawal: pending,
    }
  )
)

(define-read-only (get-health-status)
  (let ((health (calculate-health-factor)))
    {
      health-factor: health,
      status: (if (>= health u20000) "healthy"
              (if (>= health u15000) "safe"
              (if (>= health u12000) "warning"
              "critical"))),
      can-borrow: (>= health u15000),
      should-deleverage: (< health u15000),
      emergency-triggered: (< health MIN_HEALTH_FACTOR),
    }
  )
)

(define-read-only (preview-deposit (amount uint))
  {
    shares-to-receive: (calc-shares-for-deposit amount),
    share-price: (get-share-price),
    tvl-after: (+ (get-total-assets) amount),
    within-cap: (<= (+ (get-total-assets) amount) MAX_TVL),
  }
)

(define-read-only (preview-withdrawal (shares uint))
  {
    assets-to-receive: (calc-assets-for-shares shares),
    share-price: (get-share-price),
    cooldown-blocks: WITHDRAWAL_DELAY_BLOCKS,
    available-liquidity: (var-get total-sbtc-balance),
    can-withdraw: (<= (calc-assets-for-shares shares) (var-get total-sbtc-balance)),
  }
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
  (ok "sBTC Yield Vault Shares v3")
)

(define-read-only (get-symbol)
  (ok "yvsBTC-v3")
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
  (ok (some u"https://vault.pbtc21.dev/v3/token-metadata.json"))
)
