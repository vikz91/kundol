import type { CommandResult } from "../actions";

export function applyResult(result: CommandResult): void {
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
