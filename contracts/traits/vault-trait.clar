;; Vault Trait - Interface for yield vaults
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

(define-trait vault-trait
  (
    ;; Deposit underlying asset, receive vault shares
    (deposit (uint) (response uint uint))
    ;; Withdraw by burning shares, receive underlying + yield
    (withdraw (uint) (response uint uint))
    ;; Get current share price (scaled by 1e8)
    (get-share-price () (response uint uint))
    ;; Get total assets under management
    (get-total-assets () (response uint uint))
    ;; Get user position
    (get-position (principal) (response {shares: uint, deposited: uint} uint))
  )
)
