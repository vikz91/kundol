export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function toIsoDateTime(date: Date): string {
  return date.toISOString();
}
