/**
 * Centralised environment validation — fail fast at boot with a clear, complete
 * list of problems rather than a cryptic runtime error later.
 *
 * In production it additionally refuses to start with placeholder or known-weak
 * secrets, so a deploy that forgot to swap the `.env.example` defaults can never
 * silently run with a guessable JWT_SECRET or DB_PASSWORD.
 */

type Env = Record<string, string | undefined>;

const REQUIRED = ['JWT_SECRET', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

// Secrets whose value betrays an unconfigured deployment.
const PLACEHOLDER_PATTERNS = [/^replace_with/i, /^your_/i, /^changeme/i, /^example/i, /^todo/i];
const WEAK_VALUES = new Set([
  'probocaller-secret-key', 'secret', 'password', 'pass', 'root', 'admin', 'changeme', 'test', '1234', '12345678',
]);

const SECRET_KEYS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASSWORD'];

function isInsecure(value: string): boolean {
  const v = value.trim();
  if (WEAK_VALUES.has(v.toLowerCase())) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(v));
}

export function validateEnv(
  env: Env = process.env,
  opts: { production?: boolean } = {},
): void {
  const production = opts.production ?? env.NODE_ENV === 'production';
  const errors: string[] = [];

  for (const key of REQUIRED) {
    const v = env[key];
    if (!v || v.trim() === '') errors.push(`Missing required environment variable: ${key}`);
  }

  const jwt = env.JWT_SECRET ?? '';
  if (jwt && jwt.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters (generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))").');
  }

  if (production) {
    for (const key of SECRET_KEYS) {
      const v = env[key];
      if (v && isInsecure(v)) {
        errors.push(`${key} is set to an insecure placeholder/default value — set a real secret before deploying to production.`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Environment validation failed:\n  - ' + errors.join('\n  - '));
  }
}
