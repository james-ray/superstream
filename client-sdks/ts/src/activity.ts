import { BN, web3 } from "@project-serum/anchor";

import { ActivityAccount, SuperstreamClientInternal } from "./client-internal";
import { BN_ZERO } from "./utils/bn";

/**
 * A payment stream with support for SPL tokens, prepaid and limited upfront payment, unlimited lifetime, cliffs and
 * cancellations.
 *
 * Possible states of a stream:
 * - Not started
 *     - Scheduled
 *     - Cancelled before start
 * - Started but not stopped
 *     - Streaming
 *     - Paused
 * - Stopped
 *     - Cancelled after start
 *     - Ended
 */
export class Activity {
  /** @ignore
   * Reference to the internal Superstream client.
   */
  readonly clientInternal: SuperstreamClientInternal;

  /**
   * Stream public key.
   */
  readonly publicKey: web3.PublicKey;

  /**
   * If true, the stream is prepaid - all the required amount needs to be deposited on creation. Prepaid streams cannot
   * have unlimited lifetime.
   */
  readonly isActive: boolean;

  /**
   * Sender address.
   */
  readonly creator: web3.PublicKey;

  /**
   * SPL token reward mint address.
   */
  readonly stakeMint: web3.PublicKey;

  /**
   * SPL token reward mint address.
   */
  readonly rewardMint: web3.PublicKey;

  /**
   * SPL token optional reward mint address.
   */
  readonly optRewardMint: web3.PublicKey;

  /**
   * Time at which the stream was created.
   */
  readonly createdAt: BN;
  /**
   * Start time of the stream.
   *
   * INVARIANT: >= createdAt
   */
  readonly startsAt: BN;
  /**
   * End time of the stream. If the stream is unbounded, this can be 0 to indicate no end time.
   *
   * INVARIANT: prepaid: >= startsAt
   * INVARIANT: unbounded: == 0 || >= startsAt
   */
  readonly endsAt: BN;

  /**
   * Min Amount to stake.
   */
  readonly minAmount: BN;
  /**
   * Flow interval is the interval in which flow payments are released.
   */
  readonly duration: BN;
  /**
   * Flow rate is the number of tokens to stream per interval.
   */
  readonly flowRate: BN;

  /**
   * Seed of the stream PDA. It's upto the client how they choose the seed. Each tuple (seed, mint, name) corresponds
   * to a unique stream.
   */
  readonly seed: BN;
  /**
   * The PDA bump.
   */
  readonly bump: number;

  /**
   * Name of the stream. Should be unique for a particular set of (seed, mint).
   *
   * INVARIANT: Length <= 100 unicode chars or 400 bytes
   */
  readonly name: string;

  /** @ignore
   * Create a new activity object.
   *
   * @param other          The activity object
   */
  protected constructor(
    other:
      | {
          clientInternal: SuperstreamClientInternal;
          publicKey: web3.PublicKey;
          isActive: boolean;
          creator: web3.PublicKey;
          stakeMint: web3.PublicKey;
          rewardMint: web3.PublicKey;
          optRewardMint: web3.PublicKey;
          name: string;
          createdAt: BN;
          startsAt: BN;
          endsAt: BN;
          minAmount: BN;
          duration: BN;
          flowRate: BN;
          seed: BN;
          bump: number;
        }
      | Activity,
  ) {
    this.clientInternal = other.clientInternal;
    this.publicKey = other.publicKey;
    this.isActive = other.isActive;
    this.creator = other.creator;
    this.stakeMint = other.stakeMint;
    this.rewardMint = other.rewardMint;
    this.optRewardMint = other.optRewardMint;
    this.createdAt = other.createdAt;
    this.startsAt = other.startsAt;
    this.endsAt = other.endsAt;
    this.minAmount = other.minAmount;
    this.duration = other.duration;
    this.flowRate = other.flowRate;
    this.seed = other.seed;
    this.bump = other.bump;
    this.name = other.name;
  }

  /** @ignore
   * Create a new Activity object.
   *
   * @param clientInternal The Superstream internal client
   * @param publicKey      The activity public key
   * @param activityAccount  The activity account returned by Anchor
   *
   * @returns A new Stream object
   */
  static fromActivityAccount(
    clientInternal: SuperstreamClientInternal,
    publicKey: web3.PublicKey,
    activityAccount: ActivityAccount,
  ): Stream {
    return new Activity({
      clientInternal,
      publicKey,
      ...activityAccount,
    });
  }

  /**
   * Comparison function for Stream objects by the created at time.
   *
   * @param a The first Stream object
   * @param b The second Stream object
   *
   * @returns -1 if a < b, 0 if a == b or 1 if a > b
   */
  static compareFnCreatedAt(a: Activity, b: Activity): number {
    if (a.createdAt.lt(b.createdAt)) {
      return -1;
    } else if (a.createdAt.gt(b.createdAt)) {
      return 1;
    }
    return 0;
  }

  /**
   * Get the current Solana on-chain time in seconds. If there is an issue fetching the time, null is returned.
   *
   * @returns The current Solana on-chain time in seconds or null if there was an issue
   */
  readonly getCurrentTime = async (): Promise<BN | null> => {
    return this.clientInternal.getCurrentTime();
  };

  /**
   * Get the current Solana on-chain time in seconds. If there is an issue fetching the time, an error is thrown.
   *
   * @returns The current Solana on-chain time in seconds
   *
   * @throws An error is thrown if there is an issue fetching the time
   */
  readonly mustGetCurrentTime = async (): Promise<BN> => {
    return this.clientInternal.mustGetCurrentTime();
  };

  /**
   * Get the activity public key.
   *
   * @returns The activity public key
   */
  readonly getActivityPublicKey = async (): Promise<[web3.PublicKey, number]> => {
    return await this.clientInternal.getActivityPublicKey(this.seed, this.stakeMint, this.name);
  };

  /**
   * Refresh the stream.
   *
   * @returns The refreshed stream
   *
   * @throws An error is thrown if there is a Solana RPC issue
   */
  readonly refresh = async (): Promise<Activity> => {
    return await this.clientInternal.getActivity(this.publicKey);
  };

  /**
   * Check is the client wallet address is the sender of this stream.
   *
   * @returns true if the client wallet address is the sender of this stream, false otherwise
   */
  readonly isCreator = (): boolean => {
    return this.clientInternal.getWalletPublicKey().equals(this.creator);
  };

  /**
   * Check is the stream has non-zero flow payments. Flow payments refers to payments without the initial amount.
   *
   * @returns true if the stream has flow payments, false otherwise
   */
  readonly hasFlowPayments = (): boolean => {
    return (this.endsAt.lte(BN_ZERO) || this.endsAt.gt(this.startsAt)) && this.flowRate.gt(BN_ZERO);
  };

}
