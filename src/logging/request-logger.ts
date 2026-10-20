import { AsyncLocalStorage } from "node:async_hooks";
import { ConsoleLogger } from "@nestjs/common";

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export class RequestLogger extends ConsoleLogger {
  constructor() {
    super({
      json: true,
      colors: false,
      logLevels: ["log", "warn", "error", "fatal"],
      flattenParams: true,
    });
  }

  protected override getJsonLogObject(
    message: unknown,
    options: Parameters<ConsoleLogger["getJsonLogObject"]>[1],
  ) {
    const record = super.getJsonLogObject(message, options);
    const context = requestContext.getStore();
    if (context) record.requestId = context.requestId;
    return record;
  }
}

export const requestLogger = new RequestLogger();
