export const exitCodes = {
  ok: 0,
  software: 70,
} as const;

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes];
