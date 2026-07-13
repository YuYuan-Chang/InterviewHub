import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export interface Tracing {
  shutdown(): Promise<void>;
}

/**
 * OpenTelemetry bootstrap. MUST run before express/undici are imported — the
 * auto-instrumentations patch modules at require time, which is why every
 * service's index.ts calls this first and loads the app via dynamic import.
 *
 * No-ops (zero overhead, zero errors) unless OTEL_EXPORTER_OTLP_ENDPOINT is
 * set, so environments without a collector — like the kind cluster — run clean.
 */
export function initTracing(serviceName: string): Tracing {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return { shutdown: async () => {} };
  }
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation is pure noise for a web service
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown().catch(() => {}) };
}
