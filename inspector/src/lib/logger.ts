import { createLogger, format, Logger, transports } from "winston";

const CONSOLE_TRANSPORT = new transports.Console();

export function getLogger(simpleConsoleOutput?: boolean, showDebugOutput?: boolean, showJSONOutput?: boolean): Logger {
  const formats = simpleConsoleOutput ? [] : [format.timestamp()];
  if (showJSONOutput) {
    formats.push(format.json());
  } else if (simpleConsoleOutput) {
    formats.push(
      format((info) => {
        info.originalLevel = info.level;
        return info;
      })(),
      format.colorize(),
      format.printf(
        ({ originalLevel, level, message }) =>
          `${originalLevel === "error" || originalLevel === "warn" ? `[${level}] ` : ""}${message}`,
      ),
    );
  } else {
    formats.push(
      format.colorize(),
      format.align(),
      format.printf(
        ({ timestamp, level, message, ...rest }) =>
          `${timestamp} [${level}]: ${message}${Object.keys(rest).length > 0 ? ` ${JSON.stringify(2)}` : ""}`,
      ),
    );
  }

  const logger = createLogger({
    level: showDebugOutput ? "debug" : "info",
    format: format.combine(...formats),
    transports: [CONSOLE_TRANSPORT],
  });

  logger.on("finish", flushLoggerTransports);
  return logger;
}

export function flushLoggerTransports() {
  const p = new Promise((resolve) => {
    process.stdout.once("drain", () => resolve(null));
  });
  process.stdout.write("");
  return p;
}
