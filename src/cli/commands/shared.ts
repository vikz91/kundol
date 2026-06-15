import type { CommandResult } from "../actions";

export async function applyResult(result: CommandResult | Promise<CommandResult>): Promise<void> {
  const resolved = await result;
  if (resolved.exitCode !== 0) {
    process.exitCode = resolved.exitCode;
  }
}
