// Temporal client connection — mTLS in production via PEM strings in env (Fly secrets)

export interface TemporalConfig {
  address: string;
  namespace: string;
  /** Client cert PEM (not a filesystem path) */
  tls?: {
    clientCert: string;
    clientKey: string;
  };
}

function readClientCertPem(): string | undefined {
  return (
    process.env['TEMPORAL_CLIENT_CERT'] ??
    process.env['TEMPORAL_TLS_CERT'] ??
    undefined
  );
}

function readClientKeyPem(): string | undefined {
  return (
    process.env['TEMPORAL_CLIENT_KEY'] ??
    process.env['TEMPORAL_TLS_KEY'] ??
    undefined
  );
}

export function getTemporalConfig(): TemporalConfig {
  const cert = readClientCertPem();
  const key = readClientKeyPem();

  return {
    address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    namespace: process.env['TEMPORAL_NAMESPACE'] ?? 'default',
    tls:
      cert && key
        ? {
            clientCert: cert,
            clientKey: key,
          }
        : undefined,
  };
}
