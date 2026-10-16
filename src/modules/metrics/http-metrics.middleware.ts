import { Injectable, type NestMiddleware } from "@nestjs/common";
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Counter, Histogram } from "@prometheus-io/client";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    @InjectMetric("http_requests_total")
    private readonly requests: Counter<"method" | "route" | "status">,
    @InjectMetric("http_request_duration_seconds")
    private readonly duration: Histogram<"method" | "route">,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    const middlewareRoute: unknown = request.route;

    response.once("finish", () => {
      // Express sets the matched route after middleware runs. Read it at finish
      // so guards, validation failures, and controller errors are included too.
      const matchedRoute = request.route as { path?: unknown } | undefined;
      const route =
        matchedRoute !== middlewareRoute &&
        typeof matchedRoute?.path === "string"
          ? matchedRoute.path
          : "unmatched";
      const labels = { method: request.method, route };

      this.requests.inc({ ...labels, status: String(response.statusCode) });
      this.duration.observe(
        labels,
        Number(process.hrtime.bigint() - started) / 1e9,
      );
    });

    next();
  }
}
