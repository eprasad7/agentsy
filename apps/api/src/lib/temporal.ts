import { Client, Connection } from '@temporalio/client';

let cachedClient: Client | null = null;
let initPromise: Promise<Client | null> | null = null;

/**
 * Get the Temporal client. Returns the cached client if initialized,
 * otherwise returns null. Call initTemporalClient() at startup.
 */
export function getTemporalClient(): Client | null {
  return cachedClient;
}

/**
 * Initialize the Temporal client connection. Call once at startup.
 * Sets the cached client that getTemporalClient() returns.
 */
export async function initTemporalClient(): Promise<Client | null> {
  const address = process.env['TEMPORAL_ADDRESS'];
  if (!address) return null;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    const cert = process.env['TEMPORAL_CLIENT_CERT'] ?? process.env['TEMPORAL_TLS_CERT'];
    const key = process.env['TEMPORAL_CLIENT_KEY'] ?? process.env['TEMPORAL_TLS_KEY'];

    const connectionOptions: Parameters<typeof Connection.connect>[0] = { address };

    if (cert && key) {
      connectionOptions.tls = {
        clientCertPair: {
          crt: Buffer.from(cert, 'utf-8'),
          key: Buffer.from(key, 'utf-8'),
        },
      };
    }

    const connection = await Connection.connect(connectionOptions);
    const namespace = process.env['TEMPORAL_NAMESPACE'] ?? 'default';

    cachedClient = new Client({ connection, namespace });
    return cachedClient;
  })();

  return initPromise;
}
