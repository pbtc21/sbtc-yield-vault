;; sBTC Yield Vault
;; A leveraged yield vault using sBTC looping strategy on Zest Protocol
;;
;; Strategy: Deposit sBTC → Borrow USDh → Swap to sBTC → Redeposit (3 loops)
;; Target APY: ~11% net (after 10% management fee)
;; Max TVL: 1 BTC (100,000,000 sats)

;; ============================================
;; TRAITS
;; ============================================

(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; ============================================
;; CONSTANTS
;; ============================================

;; Contract deployer (operator)
(define-constant CONTRACT_OWNER tx-sender)

;; sBTC token contract
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)

;; Vault configuration
(define-constant MAX_TVL u100000000)           ;; 1 BTC in sats
(define-constant MANAGEMENT_FEE_BPS u1000)     ;; 10% = 1000 bps
(define-constant MAX_LTV_BPS u7000)            ;; 70% max loan-to-value
(define-constant LOOP_ITERATIONS u3)           ;; 3 loops for ~2.5x leverage
(define-constant BORROW_RATIO_BPS u7000)       ;; 70% borrow ratio per loop
(define-constant PRECISION u100000000)         ;; 1e8 for share price

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u1000))
(define-constant ERR_VAULT_PAUSED (err u1001))
(define-constant ERR_INVALID_AMOUNT (err u1002))
(define-constant ERR_INSUFFICIENT_SHARES (err u1003))
(define-constant ERR_TVL_CAP_EXCEEDED (err u1004))
(define-constant ERR_TRANSFER_FAILED (err u1005))
(define-constant ERR_ZERO_SHARES (err u1006))
(define-constant ERR_SLIPPAGE_EXCEEDED (err u1007))

;; ============================================
;; FUNGIBLE TOKEN (Vault Shares)
;; ============================================

(define-fungible-token vault-shares)

;; ============================================
;; DATA VARIABLES
;; ============================================

;; Vault state
(define-data-var vault-paused bool false)
(define-data-var total-assets uint u0)           ;; Total sBTC under management
(define-data-var total-borrowed uint u0)         ;; Total USDh borrowed
(define-data-var pending-fees uint u0)           ;; Unclaimed management fees
(define-data-var last-harvest-height uint u0)    ;; Last yield harvest block

;; ============================================
;; DATA MAPS
;; ============================================

;; Track user deposits for accounting
(define-map user-deposits
  principal
  {
    deposit-amount: uint,    ;; Original sBTC deposited
    deposit-height: uint,    ;; Block height of deposit
  }
)

;; ============================================
;; PRIVATE FUNCTIONS
;; ============================================

;; Calculate shares to mint for a given deposit amount
(define-private (calculate-shares-for-deposit (amount uint))
  (let (
      (total-supply (ft-get-supply vault-shares))
      (assets (var-get total-assets))
    )
    (if (is-eq total-supply u0)
      ;; First deposit: 1:1 shares
      amount
      ;; Proportional shares based on current share price
      (/ (* amount total-supply) assets)
    )
  )
)

;; Calculate assets to return for a given share amount
(define-private (calculate-assets-for-shares (shares uint))
  (let (
      (total-supply (ft-get-supply vault-shares))
      (assets (var-get total-assets))
    )
    (if (is-eq total-supply u0)
      u0
      (/ (* shares assets) total-supply)
    )
  )
)

;; Check if caller is owner
(define-private (is-owner)
  (is-eq tx-sender CONTRACT_OWNER)
)

;; ============================================
;; PUBLIC FUNCTIONS - DEPOSITS
;; ============================================

;; Deposit sBTC into the vault
(define-public (deposit (amount uint))
  (let (
      (sender tx-sender)
      (current-assets (var-get total-assets))
      (shares-to-mint (calculate-shares-for-deposit amount))
    )
    ;; Validations
    (asserts! (not (var-get vault-paused)) ERR_VAULT_PAUSED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (> shares-to-mint u0) ERR_ZERO_SHARES)
    (asserts! (<= (+ current-assets amount) MAX_TVL) ERR_TVL_CAP_EXCEEDED)

    ;; Transfer sBTC from user to vault
    ;; Note: In production, use actual sBTC contract call
    ;; (try! (contract-call? SBTC_TOKEN transfer amount sender (as-contract tx-sender) none))

    ;; Mint vault shares to user
    (try! (ft-mint? vault-shares shares-to-mint sender))

    ;; Update state
    (var-set total-assets (+ current-assets amount))

    ;; Record deposit
    (map-set user-deposits sender {
      deposit-amount: (+ (default-to u0 (get deposit-amount (map-get? user-deposits sender))) amount),
      deposit-height: block-height,
    })

    ;; Emit event
    (print {
      event: "deposit",
      user: sender,
      amount: amount,
      shares: shares-to-mint,
      total-assets: (var-get total-assets),
    })

    (ok shares-to-mint)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - WITHDRAWALS
;; ============================================

;; Withdraw by burning vault shares
(define-public (withdraw (shares uint))
  (let (
      (sender tx-sender)
      (user-shares (ft-get-balance vault-shares sender))
      (assets-to-return (calculate-assets-for-shares shares))
    )
    ;; Validations
    (asserts! (not (var-get vault-paused)) ERR_VAULT_PAUSED)
    (asserts! (> shares u0) ERR_INVALID_AMOUNT)
    (asserts! (<= shares user-shares) ERR_INSUFFICIENT_SHARES)
    (asserts! (> assets-to-return u0) ERR_ZERO_SHARES)

    ;; Burn shares
    (try! (ft-burn? vault-shares shares sender))

    ;; Update state
    (var-set total-assets (- (var-get total-assets) assets-to-return))

    ;; Transfer sBTC back to user
    ;; Note: In production, use actual sBTC contract call
    ;; (try! (as-contract (contract-call? SBTC_TOKEN transfer assets-to-return tx-sender sender none)))

    ;; Emit event
    (print {
      event: "withdraw",
      user: sender,
      shares: shares,
      assets: assets-to-return,
      total-assets: (var-get total-assets),
    })

    (ok assets-to-return)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - STRATEGY (OWNER ONLY)
;; ============================================

;; Execute looping strategy
;; This would integrate with Zest Protocol in production
(define-public (execute-loop)
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (asserts! (not (var-get vault-paused)) ERR_VAULT_PAUSED)

    ;; In production, this would:
    ;; 1. Deposit sBTC to Zest
    ;; 2. Borrow USDh at 70% LTV
    ;; 3. Swap USDh → sBTC on Bitflow
    ;; 4. Repeat 3 times

    (print {
      event: "execute-loop",
      caller: tx-sender,
      total-assets: (var-get total-assets),
      iterations: LOOP_ITERATIONS,
    })

    (ok true)
  )
)

;; Harvest yields and compound
(define-public (harvest (yield-amount uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)

    (let (
        (fee-amount (/ (* yield-amount MANAGEMENT_FEE_BPS) u10000))
        (net-yield (- yield-amount fee-amount))
      )
      ;; Add net yield to total assets (compounds for all holders)
      (var-set total-assets (+ (var-get total-assets) net-yield))

      ;; Track fees for operator
      (var-set pending-fees (+ (var-get pending-fees) fee-amount))
      (var-set last-harvest-height block-height)

      (print {
        event: "harvest",
        gross-yield: yield-amount,
        fee: fee-amount,
        net-yield: net-yield,
        total-assets: (var-get total-assets),
      })

      (ok net-yield)
    )
  )
)

;; Claim management fees
(define-public (claim-fees)
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)

    (let ((fees (var-get pending-fees)))
      (var-set pending-fees u0)

      ;; Transfer fees to owner
      ;; (try! (as-contract (contract-call? SBTC_TOKEN transfer fees tx-sender CONTRACT_OWNER none)))

      (print {
        event: "claim-fees",
        amount: fees,
        recipient: CONTRACT_OWNER,
      })

      (ok fees)
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - ADMIN
;; ============================================

;; Pause/unpause vault
(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (var-set vault-paused paused)
    (print { event: "set-paused", paused: paused })
    (ok true)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get current share price (scaled by 1e8)
(define-read-only (get-share-price)
  (let (
      (total-supply (ft-get-supply vault-shares))
      (assets (var-get total-assets))
    )
    (if (is-eq total-supply u0)
      PRECISION  ;; 1.0 if no shares
      (/ (* assets PRECISION) total-supply)
    )
  )
)

;; Get total assets under management
(define-read-only (get-total-assets)
  (var-get total-assets)
)

;; Get total shares supply
(define-read-only (get-total-shares)
  (ft-get-supply vault-shares)
)

;; Get user's share balance
(define-read-only (get-user-shares (user principal))
  (ft-get-balance vault-shares user)
)

;; Get user's position value in sBTC
(define-read-only (get-user-assets (user principal))
  (calculate-assets-for-shares (ft-get-balance vault-shares user))
)

;; Get user deposit info
(define-read-only (get-position (user principal))
  (let (
      (shares (ft-get-balance vault-shares user))
      (deposit-info (map-get? user-deposits user))
    )
    {
      shares: shares,
      assets: (calculate-assets-for-shares shares),
      deposited: (default-to u0 (get deposit-amount deposit-info)),
      deposit-height: (default-to u0 (get deposit-height deposit-info)),
    }
  )
)

;; Get vault stats
(define-read-only (get-vault-stats)
  {
    total-assets: (var-get total-assets),
    total-shares: (ft-get-supply vault-shares),
    share-price: (get-share-price),
    tvl-cap: MAX_TVL,
    tvl-remaining: (- MAX_TVL (var-get total-assets)),
    pending-fees: (var-get pending-fees),
    is-paused: (var-get vault-paused),
    management-fee-bps: MANAGEMENT_FEE_BPS,
    loop-iterations: LOOP_ITERATIONS,
  }
)

;; Get vault configuration
(define-read-only (get-config)
  {
    owner: CONTRACT_OWNER,
    max-tvl: MAX_TVL,
    management-fee-bps: MANAGEMENT_FEE_BPS,
    max-ltv-bps: MAX_LTV_BPS,
    loop-iterations: LOOP_ITERATIONS,
    borrow-ratio-bps: BORROW_RATIO_BPS,
  }
)

;; ============================================
;; SIP-010 IMPLEMENTATION (Vault Shares Token)
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
  (ok "sBTC Yield Vault Shares")
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
  (ok none)
)
