// Run in a fresh process: instrumentation must precede HTTP module imports.
import { register } from "node:module";
register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
const { startTelemetry, shutdownTelemetry } = await import(process.argv[2]);
startTelemetry();
const { createServer, get } = await import("node:http");

let handler = (request, response) => {
  if (request.url === "/outgoing") {
    get(`http://127.0.0.1:${server.address().port}/upstream`, (upstream) => {
      upstream.resume();
      upstream.on("end", () => response.end("outgoing completed"));
    });
    return;
  }
  response.statusCode = request.url === "/failure" ? 500 : 200;
  response.end("response");
};
if (process.env.TRACING_TEST_EXPRESS === "true") {
  const { default: express } = await import("express");
  const app = express();
  let logger;
  if (process.env.TRACING_TEST_LOGGING === "true") {
    const { requestLoggingMiddleware } = await import(
      new URL("./request-logging.middleware.js", process.argv[2])
    );
    ({ requestLogger: logger } = await import(
      new URL("./request-logger.js", process.argv[2])
    ));
    logger.log("Tracing fixture ready");
    app.use(requestLoggingMiddleware);
  }
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const router = express.Router();
  router.use(function fixtureMiddleware(_request, _response, next) {
    next();
  });
  router.get("/content/:id", async (_request, response) => {
    await new Promise((resolve) => setImmediate(resolve));
    logger?.log("Request handled");
    response.json({ ok: true });
  });
  router.get("/failure/:id", async (_request, _response, next) => {
    await new Promise((resolve) => setImmediate(resolve));
    next(new Error("Request failed"));
  });
  app.use(router);
  app.use((error, _request, response, _next) => {
    logger?.error(error);
    response.sendStatus(500);
  });
  handler = app;
}
const server = createServer(handler);
server.listen(0, "127.0.0.1", () => {
  process.send({ port: server.address().port });
});
process.on("SIGTERM", async () => {
  await new Promise((resolve) => server.close(resolve));
  await shutdownTelemetry();
  process.exit(0);
});
