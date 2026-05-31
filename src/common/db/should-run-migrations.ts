const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

export function shouldRunMigrations(env: Record<string, string | undefined>): boolean {
  const raw = String(env.RUN_MIGRATIONS ?? '').toLowerCase();
  if (TRUTHY.has(raw)) return true;
  if (FALSY.has(raw)) return false;
  return env.NODE_ENV === 'production';
}
