import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import {
  makeCounterProvider,
  makeHistogramProvider,
  PrometheusModule,
} from "@willsoto/nestjs-prometheus";
import { HttpMetricsMiddleware } from "./http-metrics.middleware.js";
import { MetricsController } from "./metrics.controller.js";

@Module({
  imports: [PrometheusModule.register({ controller: MetricsController })],
  providers: [
    makeCounterProvider({
      name: "http_requests_total",
      help: "Total number of completed HTTP requests by method, route, and status.",
      labelNames: ["method", "route", "status"],
    }),
    makeHistogramProvider({
      name: "http_request_duration_seconds",
      help: "Duration of completed HTTP requests in seconds by method and route.",
      labelNames: ["method", "route"],
    }),
    HttpMetricsMiddleware,
  ],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HttpMetricsMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
