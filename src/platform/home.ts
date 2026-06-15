import { homedir } from "node:os";

export interface HomeProviderOptions {
  env?: NodeJS.ProcessEnv;
}

export function getHomeDirectory(options: HomeProviderOptions = {}): string {
  const env = options.env ?? process.env;
  return env.HOME || env.USERPROFILE || homedir();
}
