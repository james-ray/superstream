import { web3 } from "@project-serum/anchor";

/**
 * A Solana wallet with a public key and methods to sign transaction.
 */
export type Wallet = {
  /**
   * Wallet public key.
   */
  publicKey: web3.PublicKey;

  /**
   * Sign a transaction using the wallet private key.
   *
   * @param transaction The transaction to sign
   *
   * @returns The signed transaction
   */
  signTransaction: (transaction: web3.Transaction) => Promise<web3.Transaction>;
  /**
   * Sign all transactions using the wallet private key.
   *
   * @param transactions The transactions to sign
   *
   * @returns The signed transactions
   */
  signAllTransactions: (transactions: web3.Transaction[]) => Promise<web3.Transaction[]>;
};

/**
 * A no-op Solana wallet used when no on-chain transactions need to signed.
 */
export const NO_OP_WALLET: Wallet = {
  publicKey: web3.PublicKey.default,
  signTransaction: (transaction: web3.Transaction): Promise<web3.Transaction> => Promise.resolve(transaction),
  signAllTransactions: (transactions: web3.Transaction[]): Promise<web3.Transaction[]> => Promise.resolve(transactions),
};
