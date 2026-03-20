// Temporal client connection — will use mTLS in production
// For now, exports the configuration shape

export interface TemporalConfig {
  address: string;
  namespace: string;
  tls?: {
    clientCertPath: string;
    clientKeyPath: string;
  };
}

export function getTemporalConfig(): TemporalConfig {
  return {
    address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    namespace: process.env['TEMPORAL_NAMESPACE'] ?? 'default',
    tls: process.env['TEMPORAL_TLS_CERT']
      ? {
          clientCertPath: process.env['TEMPORAL_TLS_CERT'] ?? '',
          clientKeyPath: process.env['TEMPORAL_TLS_KEY'] ?? '',
        }
      : undefined,
  };
}
