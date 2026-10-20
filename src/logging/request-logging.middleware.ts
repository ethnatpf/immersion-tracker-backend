import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { requestContext, requestLogger } from "./request-logger.js";

export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const started = process.hrtime.bigint();
  const context = { requestId: randomUUID() };
  response.setHeader("X-Request-ID", context.requestId);

  requestContext.run(context, () => {
    const excluded = /^\/(?:metrics\/?|api(?:\/.*|-json|-yaml)?)$/i.test(
      request.path,
    );
    if (!excluded) {
      response.once("finish", () => {
        const route = request.route as { path?: unknown } | undefined;
        // Bind the completion record to this request even when another async
        // resource triggers the response's finish event.
        requestContext.run(context, () => {
          requestLogger.log(
            "HTTP request completed",
            {
              method: request.method,
              // Metrics middleware uses a catch-all Express route, which can
              // remain on requests that never match a controller endpoint.
              route:
                typeof route?.path === "string" && route.path !== "/{*path}"
                  ? route.path
                  : "unmatched",
              status: response.statusCode,
              durationMs: Number(process.hrtime.bigint() - started) / 1e6,
            },
            "HTTP",
          );
        });
      });
    }
    next();
  });
}
