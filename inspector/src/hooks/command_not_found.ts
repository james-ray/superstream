import { Hook, toConfiguredId } from "@oclif/core";
import Levenshtein from "fast-levenshtein";

import { getLogger } from "../lib/logger";

const hook: Hook.CommandNotFound = async function ({ id, config }) {
  const hiddenCommandIds = new Set(config.commands.filter((c) => c.hidden).map((c) => c.id));
  const commandIDs = [...config.commandIDs, ...config.commands.flatMap((c) => c.aliases)].filter(
    (c) => !hiddenCommandIds.has(c),
  );

  const originalCmd = toConfiguredId(id, this.config);
  let binHelp = `${config.bin} --help`;
  const idSplit = id.split(":");
  if (config.findTopic(idSplit[0])) {
    binHelp = `${config.bin} ${idSplit[0]} --help`;
  }

  const logger = getLogger(true);
  logger.error(`'${originalCmd}' is not a ${config.bin} command. See '${binHelp}'.`);
  if (commandIDs.length === 0) {
    return;
  }

  const distances = commandIDs
    .map((commandID) => ({ commandID, distance: Levenshtein.get(id, commandID) }))
    .sort((a, b) => (a.distance < b.distance ? -1 : a.distance > b.distance ? 1 : 0));
  const closeDistances = distances.filter(({ distance }) => distance <= 4).splice(0, 3);
  if (closeDistances.length === 0) {
    return;
  }

  logger.info(
    `\nThe most similar command${closeDistances.length === 1 ? " is:" : "s are:"}\n${closeDistances
      .map(({ commandID }) => `    ${toConfiguredId(commandID, this.config)}`)
      .join("\n")}`,
  );
};

export default hook;
