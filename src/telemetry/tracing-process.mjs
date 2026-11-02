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

const server = createServer(handler);
server.listen(0, "127.0.0.1", () => {
  process.send({ port: server.address().port });
});
process.on("SIGTERM", async () => {
  await new Promise((resolve) => server.close(resolve));
  await shutdownTelemetry();
  process.exit(0);
});
