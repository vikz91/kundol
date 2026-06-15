import { Chalk } from "chalk";

const color = new Chalk({ level: 1 });

export function formatWelcomeMessage(): string {
  const title = color.bold.cyan("kundol");
  const subtitle = color.white("local project radar + safe cleanup cockpit");
  const accent = color.green("dry-run first");
  const muted = color.gray;

  return [
    color.cyan("+------------------------------------------------------------+"),
    `${color.cyan("|")}  ${title} ${muted("v0.1.0")}  ${subtitle}`,
    `${color.cyan("|")}  ${muted("Index workspaces. Find stale repos. Reclaim space.")}`,
    `${color.cyan("|")}  ${muted("Safety mode:")} ${accent} ${muted(":: .git/.env/db/media protected")}`,
    color.cyan("+------------------------------------------------------------+"),
    "",
    `${color.yellow("Next:")} ${color.bold("kundol index")} ${muted("|")} ${color.bold("kundol list")} ${muted("|")} ${color.bold("kundol scan <project>")} ${muted("|")} ${color.bold("kundol clean <project>")}`,
    "",
  ].join("\n");
}
