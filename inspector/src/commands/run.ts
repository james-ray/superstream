import { BN } from "@project-serum/anchor";
import { Stream, StreamPagination } from "@superstream/client";
import { Logger } from "winston";

import BaseCommand from "../lib/base-command";
import { getErrorMessage } from "../lib/error";
import { getLogger } from "../lib/logger";
import { sleep } from "../lib/time";

const PAGE_SIZE = 25;

export default class Run extends BaseCommand {
  static description = "Run inspector process.";

  static flags = {
    ...BaseCommand.getWalletFlags(true),
  };

  static examples = [
    `inspector run -w ~/.config/solana/id.json`,
    `inspector run -c testnet -w ~/.config/solana/id.json`,
  ];

  protected advancedLogger: Logger = getLogger(false);

  async init(): Promise<void> {
    await super.init();
    this.advancedLogger = getLogger(false, this.isDebugEnabled, this.isJSONEnabled);
  }

  async run(): Promise<void> {
    this.advancedLogger.info("Starting inspector...");
    for (let iteration = 1; ; iteration++) {
      await this.checkForInsolventStreamsWithRetry(iteration);
      await sleep(2500);
    }
  }

  private async checkForInsolventStreamsWithRetry(iteration?: number): Promise<void> {
    for (let tryNo = 1; ; tryNo++) {
      try {
        return await this.checkForInsolventStreams(iteration);
      } catch (e) {
        this.advancedLogger.error(`Error processing streams [try=${tryNo}]: ${getErrorMessage(e)}`);
        this.advancedLogger.error("Retrying in sometime...");
        await sleep(10000);
        this.advancedLogger.error("Retrying...");
      }
    }
  }

  private async checkForInsolventStreams(iteration?: number): Promise<void> {
    this.advancedLogger.info(
      `Checking for insolvent streams${iteration != null && iteration > 0 ? ` [iteration=${iteration}]` : ""}...`,
    );

    const pagination = this.client.getAllStreamsPagination({ isPrepaid: false });
    await pagination.initialize();

    for (let i = 1; ; i++) {
      if (await this.checkPageForInsolventStreamsWithRetry(pagination, i)) {
        break;
      }
    }

    this.advancedLogger.info("Done checking for insolvent streams");
  }

  async checkPageForInsolventStreamsWithRetry(pagination: StreamPagination, pageNo: number): Promise<boolean> {
    for (let tryNo = 1; ; tryNo++) {
      try {
        return await this.checkPageForInsolventStreams(pagination, pageNo);
      } catch (e) {
        this.advancedLogger.error(`Error processing page [page=${pageNo}, try=${tryNo}]: ${getErrorMessage(e)}`);
        this.advancedLogger.error("Retrying in sometime...");
        await sleep(10000);
        this.advancedLogger.error("Retrying...");
      }
    }
  }

  async checkPageForInsolventStreams(pagination: StreamPagination, pageNo: number): Promise<boolean> {
    const streams = await pagination.getStreams({
      offset: pageNo <= 0 ? 0 : (pageNo - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
    if (streams.length === 0) {
      return true;
    }

    const at = await this.client.mustGetCurrentTime();
    await Promise.all(streams.map((stream) => this.checkStreamForInsolventStreams(stream, at)));
    return false;
  }

  async checkStreamForInsolventStreams(stream: Stream | null, at: BN): Promise<void> {
    if (!stream) {
      return;
    }

    if (!stream.hasStopped(at) && !stream.isSolvent(at)) {
      this.advancedLogger.info(`Found insolvent stream [publicKey=${stream.publicKey.toBase58()}]`);
      try {
        await stream.cancel(at);
        this.advancedLogger.info(`Cancelled insolvent stream [publicKey=${stream.publicKey.toBase58()}]`);
      } catch (e) {
        this.advancedLogger.error(
          `Unable to cancel insolvent stream [publicKey=${stream.publicKey.toBase58()}]: ${getErrorMessage(e)}`,
        );
      }
    }
  }
}
