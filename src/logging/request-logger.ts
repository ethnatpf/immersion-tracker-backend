import { AsyncLocalStorage } from "node:async_hooks";
import { ConsoleLogger, LogLevel } from "@nestjs/common";

export const requestContext = new AsyncLocalStorage<{
  requestId: string;
  traceId?: string;
}>();

export class RequestLogger extends ConsoleLogger {
  constructor() {
    super({
      json: true,
      colors: false,
      logLevels: ["warn", "error", "fatal"].concat(
        process.env.NODE_ENV === "production" ? [] : ["log"],
      ) as LogLevel[],
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
    if (context?.traceId) record.trace_id = context.traceId;
    return record;
  }
}

export const requestLogger = new RequestLogger();
