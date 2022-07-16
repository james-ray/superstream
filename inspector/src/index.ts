import { Interfaces, run as libRun } from "@oclif/core";
import cleanStack from "clean-stack";

import { flushLoggerTransports, getLogger } from "./lib/logger";

export async function run(argv?: string[], options?: Interfaces.LoadOptions): Promise<void> {
  let exitCode = 0;
  try {
    await libRun(argv, options);
  } catch (e) {
    exitCode = 1;

    const logger = getLogger(false, false);
    try {
      if (e instanceof Error) {
        if (e.message !== "SIGINT") {
          logger.error("Unexpected error", cleanStack(e.stack));
        }
      } else {
        logger.error(e);
      }
    } catch (inner) {
      logger.error("Unexpected error", inner);
      logger.error("Original unexpected error", e);
    }
  } finally {
    await flushLoggerTransports();
    process.exit(exitCode);
  }
}
