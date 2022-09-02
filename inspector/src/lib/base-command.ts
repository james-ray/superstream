import { Command, Flags, Interfaces } from "@oclif/core";
import { Wallet as NodeWallet, web3 } from "@project-serum/anchor";
import { createSuperstreamClient, SuperstreamClient } from "@superstream/client";
import { Logger } from "winston";

import { Cluster, clusterToWeb3Cluster, parseCluster } from "./cluster";
import { getErrorMessage } from "./error";
import { readKeypair } from "./keypair";
import { getLogger } from "./logger";

export default abstract class BaseCommand extends Command {
  static globalFlags = {
    cluster: Flags.string({
      char: "c",
      description: "Solana cluster",
      options: ["devnet", "testnet", "localnet"],
      default: "devnet",
    }),
    debug: Flags.boolean({
      char: "d",
      description: "Show debug output",
    }),
    json: Flags.boolean({
      char: "j",
      description: "Show output as JSON",
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getWalletFlags(required?: boolean): { wallet: Interfaces.OptionFlag<string | undefined> } {
    return {
      wallet: Flags.file({
        char: "w",
        description: "Wallet keypair JSON file path",
        required: !!required,
        exists: true,
      }),
    };
  }

  protected isDebugEnabled = false;
  protected isJSONEnabled = false;
  protected logger: Logger = getLogger(true);
  protected cluster: Cluster = Cluster.DEVNET;
  protected keyPair: web3.Keypair = web3.Keypair.generate();
  protected client: SuperstreamClient = createSuperstreamClient(clusterToWeb3Cluster(Cluster.DEVNET));
  protected flags: Record<string, string> = {};

  log(level: string, message: string): void {
    this.logger.log(level, message);
  }

  logToStderr(message: string): void {
    this.logger.error(message);
  }

  jsonEnabled(): boolean {
    return this.isJSONEnabled;
  }

  private setKeyPair(filePath?: string): void {
    if (!filePath) {
      return;
    }

    try {
      this.keyPair = readKeypair(filePath);
    } catch (e) {
      this.logger.error(`Unable to read Solana wallet keypair JSON file: ${getErrorMessage(e)}`);
      this.exit(1);
    }
  }

  async init(): Promise<void> {
    const { flags: flagsOutput } = await this.parse();

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const flags = flagsOutput as Record<string, string>;

    this.isDebugEnabled = !!flags.debug;
    this.isJSONEnabled = !!flags.json;
    this.logger = getLogger(true, this.isDebugEnabled, this.isJSONEnabled);
    this.cluster = parseCluster(flags.cluster);
    this.setKeyPair(flags.wallet);
    this.client = createSuperstreamClient(clusterToWeb3Cluster(this.cluster), new NodeWallet(this.keyPair));
    this.flags = flags;
  }

  async catch(
    error: Error & {
      exitCode?: number;
    },
  ) {
    this.logger.error(error);
  }

  async finally(
    error?: Error & {
      exitCode?: number;
    },
  ): Promise<void> {
    const exitCode = error?.exitCode;
    this.logger.end(() => process.exit(exitCode != null && exitCode > 0 ? exitCode : 0));
  }
}
