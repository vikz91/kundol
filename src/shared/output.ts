export interface Output {
  writeLine(message?: string): void;
  writeError(message?: string): void;
}

export const consoleOutput: Output = {
  writeLine(message = "") {
    console.log(message);
  },
  writeError(message = "") {
    console.error(message);
  }
};

export function formatNotImplemented(command: string, nextTask: string): string {
  return [
    `kundol ${command} is not implemented yet.`,
    `Next implementation task: ${nextTask}.`,
    "Run `kundol --help` to see the planned command surface."
  ].join("\n");
}
