import { Client, Connection } from '@temporalio/client';

let cachedClient: Client | null = null;

export function getTemporalClient(): Client | null {
  if (cachedClient) return cachedClient;

  const address = process.env['TEMPORAL_ADDRESS'];
  if (!address) return null;

  // Client will be initialized lazily on first use
  return null;
}

let initPromise: Promise<Client> | null = null;

/**
 * Initialize the Temporal client connection. Call once at startup.
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
