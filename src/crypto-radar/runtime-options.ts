const SMOKE_FLAG = "--crypto-radar-smoke";

export function shouldUseSingleInstanceLock(argv: readonly string[]) {
  return !argv.includes(SMOKE_FLAG);
}
