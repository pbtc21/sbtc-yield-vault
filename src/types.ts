// Vault types
export interface VaultStats {
  totalAssets: string;
  totalShares: string;
  sharePrice: string;
  tvlCap: string;
  tvlRemaining: string;
  pendingFees: string;
  isPaused: boolean;
  managementFeeBps: number;
  loopIterations: number;
  estimatedApy: string;
  liquidBalance?: string;
  deployedBalance?: string;
  usdhDebt?: string;
}

export interface UserPosition {
  address: string;
  shares: string;
  assets: string;
  deposited: string;
  depositHeight: number;
  profit: string;
  profitPercent: string;
}

export interface DepositRequest {
  amount: string; // in sats
  sender: string; // STX address
}

export interface WithdrawRequest {
  shares: string;
  sender: string;
  minReceive?: string;
}

export interface PaymentInfo {
  amount: string;
  token: string;
  address: string;
  memo: string;
  network: string;
}

export interface Env {
  VAULT_CONTRACT: string;
  OPERATOR_ADDRESS: string;
  NETWORK: string;
}

// Payment info stored in context after x402 verification
export interface PaymentContext {
  txId: string;
  sender: string;
  amount: string;
  status: string;
}

// Hono context variables
export interface Variables {
  payment?: PaymentContext;
}
