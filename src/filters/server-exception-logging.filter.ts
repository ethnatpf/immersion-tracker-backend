import { Catch, HttpException, type ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { requestLogger } from "../logging/request-logger.js";

@Catch()
export class ServerExceptionLoggingFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const span = trace.getActiveSpan();
    const error = exception instanceof Error ? exception : String(exception);
    span?.recordException(error);
    span?.setStatus({
      code: SpanStatusCode.ERROR,
      ...(exception instanceof Error ? { message: exception.message } : {}),
    });

    if (exception instanceof HttpException && exception.getStatus() >= 500) {
      requestLogger.error(
        exception.message,
        exception.stack,
        "ExceptionsHandler",
      );
    }

    super.catch(exception, host);
  }
}
