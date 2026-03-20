import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';

/**
 * Better Auth instance.
 *
 * Uses the built-in Postgres adapter (connection URL) rather than the Drizzle
 * adapter to avoid version conflicts between our drizzle-orm (0.38) and
 * better-auth's adapter requirement (>=0.41).
 *
 * On signup, Better Auth creates user + session. Post-signup org/environment
 * seeding is handled by the API's onboarding endpoint, not a database hook.
 */
export function createAuth(databaseUrl: string) {
  return betterAuth({
    database: {
      type: 'postgres',
      url: databaseUrl,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    socialProviders: {
      google: {
        clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
        enabled: !!(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']),
      },
      github: {
        clientId: process.env['GITHUB_CLIENT_ID'] ?? '',
        clientSecret: process.env['GITHUB_CLIENT_SECRET'] ?? '',
        enabled: !!(process.env['GITHUB_CLIENT_ID'] && process.env['GITHUB_CLIENT_SECRET']),
      },
    },
    plugins: [organization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
