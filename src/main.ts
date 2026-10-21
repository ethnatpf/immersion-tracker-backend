import { register } from "node:module";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// Register the ESM hook and start tracing before loading Nest or HTTP modules.
register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
const { startTelemetry, shutdownTelemetry } =
  await import("./telemetry/telemetry.js");
startTelemetry();

try {
  await import("./bootstrap.js");
} catch (error) {
  await shutdownTelemetry();
  throw error;
}
