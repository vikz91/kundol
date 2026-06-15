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
