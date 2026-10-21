import { NodeSDK } from "@opentelemetry/sdk-node";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  ExpressInstrumentation,
  ExpressLayerType,
} from "@opentelemetry/instrumentation-express";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";

let sdk: NodeSDK | undefined;
let shutdown: Promise<void> | undefined;

export function startTelemetry(): void {
  if (sdk || process.env.OTEL_SDK_DISABLED?.toLowerCase() === "true") return;

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "immersion-tracker-api",
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        "http://localhost:4318/v1/traces",
      timeoutMillis: 3_000,
    }),
    metricReaders: [],
    logRecordProcessors: [],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook(request) {
          const path = (request.url ?? "").split("?", 1)[0];
          return /^\/(?:metrics\/?|api(?:\/.*|-json|-yaml)?)$/i.test(path);
        },
      }),
      new ExpressInstrumentation({
        ignoreLayersType: [
          ExpressLayerType.ROUTER,
          ExpressLayerType.MIDDLEWARE,
          ExpressLayerType.REQUEST_HANDLER,
        ],
      }),
    ],
  });
  sdk.start();
}

export function shutdownTelemetry(): Promise<void> {
  if (!sdk) return Promise.resolve();
  return (shutdown ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        sdk!.shutdown(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Telemetry shutdown timed out")),
            5_000,
          );
        }),
      ]);
    } catch (error) {
      console.warn("Unable to flush telemetry during shutdown", error);
    } finally {
      clearTimeout(timer);
    }
  })());
}
