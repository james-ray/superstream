import path from "path";

import { Config, HelpBase, Interfaces, loadHelpClass, toConfiguredId } from "@oclif/core";
import fs from "fs-extra";
import GithubSlugger from "github-slugger";

const INSPECTOR_REPOSITORY_URL = "https://github.com/superstream-finance/superstream/blob/main/inspector";

const INSPECTOR_PATH = path.join(__dirname, "..");
const README_PATH = path.join(INSPECTOR_PATH, "README.md");
const DOCS_PATH = path.join(INSPECTOR_PATH, "docs");

const githubSlugger = new GithubSlugger();

async function generateDocs(): Promise<void> {
  let readme = (await fs.readFile(README_PATH, "utf8")).toString();
  const config = await Config.load({ root: INSPECTOR_PATH, devPlugins: false, userPlugins: false });

  let commands = config.commands
    .filter((c) => !c.hidden && c.pluginType === "core")
    .map((c) => (c.id === "." ? { ...c, id: "" } : c));
  commands = uniqBy(commands, (c) => c.id);
  commands = sortBy(commands, (c) => c.id);

  let topics = config.topics
    .filter((t) => !t.hidden && !t.name.includes(":"))
    .filter((t) => commands.find((c) => c.id === t.name || c.id.startsWith(t.name + ":")));
  topics = uniqBy(topics, (t) => t.name);
  topics = sortBy(topics, (t) => t.name);

  readme = replaceTag(
    readme,
    "commands",
    topics
      .map(
        (t) =>
          `- [\`${config.bin} ${t.name}\`](${INSPECTOR_REPOSITORY_URL}/docs/${t.name.replace(/:/g, "/")}.md)${
            t.description?.trim() ? ` - ${t.description.trim()}` : ""
          }`,
      )
      .join("\n"),
  );

  await fs.writeFile(README_PATH, readme);

  const HelpClass = await loadHelpClass(config);
  const help = new HelpClass(config, { stripAnsi: true, maxWidth: 120 }) as MaybeCompatibleHelp;

  await fs.remove(DOCS_PATH);
  await fs.mkdirp(DOCS_PATH);

  for (const topic of topics) {
    await generateTopicDocsFile(
      path.join(DOCS_PATH, topic.name.replace(/:/g, "/") + ".md"),
      config,
      topic,
      commands.filter((c) => c.id === topic.name || c.id.startsWith(topic.name + ":")),
      help,
    );
  }
}

generateDocs();

async function generateTopicDocsFile(
  filePath: string,
  config: Interfaces.Config,
  topic: Interfaces.Topic,
  commands: Interfaces.Command[],
  help: MaybeCompatibleHelp,
): Promise<void> {
  const showOnlyCommand = commands.length === 1 && commands[0].id === topic.name;
  let topicDocs = "";
  if (showOnlyCommand) {
    topicDocs = generateCommandDocs(config, commands[0], help, true);
  } else {
    topicDocs = `# \`${config.bin} ${topic.name}\`
${topic.description?.trim() ? `\n${topic.description.trim()}\n` : ""}
${generateCommandsDocs(config, commands, help)}
`;
  }

  await fs.writeFile(filePath, topicDocs);
}

function generateCommandsDocs(
  config: Interfaces.Config,
  commands: Interfaces.Command[],
  help: MaybeCompatibleHelp,
): string {
  return [
    ...commands.map((c) => {
      const usage = generateCommandUsage(config, c);
      return usage
        ? `- [\`${config.bin} ${usage}\`](#${githubSlugger.slug(`${config.bin}-${usage}`)})`
        : `- [\`${config.bin}\`](#${githubSlugger.slug(`${config.bin}`)})`;
    }),
    "",
    ...commands.map((c) => generateCommandDocs(config, c, help, false)).map((s) => s.trim() + "\n"),
  ]
    .join("\n")
    .trim();
}

function generateCommandDocs(
  config: Interfaces.Config,
  command: Interfaces.Command,
  help: MaybeCompatibleHelp,
  showOnlyCommand: boolean,
): string {
  const title = (command.summary || command.description || "").trim().split("\n")[0];
  const headingTag = showOnlyCommand ? "#" : "##";
  const usage = generateCommandUsage(config, command);
  const header = usage ? `${headingTag} \`${config.bin} ${usage}\`` : `${headingTag} \`${config.bin}\``;

  return `${header}

${title}

\`\`\`shell
${generateCommandHelp(command, help)}
\`\`\`

${generateCommandCode(command)}
`;
}

function generateCommandCode(command: Interfaces.Command): string {
  const commandCodePath = getCommandCodePath(command);
  return `*See code [/src/commands/${commandCodePath}](../src/commands/${commandCodePath})*`;
}

function generateCommandUsage(config: Interfaces.Config, command: Interfaces.Command): string {
  const getArgName = (arg: Interfaces.Arg) => {
    const name = arg.name.toUpperCase();
    return arg.required ? name : `[${name}]`;
  };

  const usages = castToArray(command.usage);
  if (usages.length > 0) {
    return usages[0];
  }

  const id = toConfiguredId(command.id, config);
  const commandArgs = command.args.filter((a) => !a.hidden).map((a) => getArgName(a));
  return `${id}${commandArgs.length === 0 ? "" : ` ${command.args.join(" ")}`}`;
}

function getCommandCodePath(command: Interfaces.Command): string {
  let relativePath = path.join(...command.id.split(":"));
  const fullPath = path.join(INSPECTOR_PATH, "src", "commands", relativePath);
  if (fs.pathExistsSync(path.join(fullPath, "index.ts"))) {
    relativePath = path.join(relativePath, "index.ts");
  } else if (fs.pathExistsSync(fullPath + ".ts")) {
    relativePath += ".ts";
  } else {
    throw new Error(`Command code path for '${command.id}' not found`);
  }

  return relativePath.replace(/\\/g, "/");
}

interface MaybeCompatibleHelp extends HelpBase {
  formatCommand?: (command: Interfaces.Command) => string;
  command?: (command: Interfaces.Command) => string;
}

function generateCommandHelp(command: Interfaces.Command, help: MaybeCompatibleHelp) {
  if (help.formatCommand) {
    return help.formatCommand(command).trim();
  } else if (help.command) {
    return `${command.description}\n\n${help.command(command)}`.trim();
  }

  throw new Error("Please implement `formatCommand` in your custom help class");
}

function replaceTag(readme: string, tag: string, body: string): string {
  if (readme.includes(`<!-- ${tag} -->`) && readme.includes(`<!-- ${tag}stop -->`)) {
    readme = readme.replace(new RegExp(`<!-- ${tag} -->(.|\n)*<!-- ${tag}stop -->`, "m"), `<!-- ${tag} -->`);
  }
  return readme.replace(`<!-- ${tag} -->`, `<!-- ${tag} -->\n${body}\n<!-- ${tag}stop -->`);
}

function uniqBy<T, U>(arr: T[], fn: (item: T) => U): T[] {
  const set = new Set<U>();
  return arr.filter((c) => {
    const value = fn(c);
    if (set.has(value)) {
      return false;
    }
    set.add(value);
    return true;
  });
}

function sortBy<T, U>(arr: T[], fn: (item: T) => U): T[] {
  arr.sort((a, b) => {
    const aValue = fn(a);
    const bValue = fn(b);
    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
  });
  return arr;
}

export function castToArray<T>(input?: T | T[]): T[] {
  return input === undefined ? [] : Array.isArray(input) ? input : [input];
}
