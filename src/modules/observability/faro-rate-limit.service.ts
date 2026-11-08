import {
  Injectable,
  HttpException,
  PayloadTooLargeException,
} from "@nestjs/common";
import {
  FARO_PAYLOAD_LIMIT_BYTES,
  FARO_PAYLOAD_WINDOW_MS,
  FARO_REQUEST_LIMIT,
  FARO_REQUEST_WINDOW_MS,
} from "../../constants.js";

type FaroUsage = { timestamp: number; bytes: number };

@Injectable()
export class FaroRateLimitService {
  // This is process-local. Use shared storage such as Redis if the backend is
  // scaled across multiple processes or hosts so users share one quota.
  private readonly usageByUser = new Map<string, FaroUsage[]>();

  consume(userId: string, payloadBytes: number, now = Date.now()): void {
    if (payloadBytes > FARO_PAYLOAD_LIMIT_BYTES) {
      throw new PayloadTooLargeException("Faro payload exceeds 2 MiB");
    }

    const activeUsage = (this.usageByUser.get(userId) ?? []).filter(
      ({ timestamp }) => timestamp > now - FARO_PAYLOAD_WINDOW_MS,
    );
    const requestsInWindow = activeUsage.filter(
      ({ timestamp }) => timestamp > now - FARO_REQUEST_WINDOW_MS,
    ).length;
    const bytesInWindow = activeUsage.reduce(
      (total, usage) => total + usage.bytes,
      0,
    );

    if (requestsInWindow >= FARO_REQUEST_LIMIT) {
      throw new HttpException("Faro request limit exceeded", 429);
    }
    if (bytesInWindow + payloadBytes > FARO_PAYLOAD_LIMIT_BYTES) {
      throw new HttpException("Faro payload byte limit exceeded", 429);
    }

    activeUsage.push({ timestamp: now, bytes: payloadBytes });
    this.usageByUser.set(userId, activeUsage);
  }
}
