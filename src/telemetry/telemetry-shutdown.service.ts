import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { shutdownTelemetry } from "./telemetry.js";

@Injectable()
export class TelemetryShutdownService implements OnApplicationShutdown {
  onApplicationShutdown(): Promise<void> {
    return shutdownTelemetry();
  }
}
