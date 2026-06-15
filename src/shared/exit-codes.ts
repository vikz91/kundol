export const exitCodes = {
  ok: 0,
  usage: 1,
  notImplemented: 2
} as const;

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes];
