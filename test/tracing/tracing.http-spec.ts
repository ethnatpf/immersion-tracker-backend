import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import protobuf from "protobufjs";
import ts from "typescript";

// Only the standard OTLP fields asserted below; protobuf skips other fields.
const exportType = protobuf
  .parse(
    `syntax = "proto3";
  message Value { string stringValue = 1; int64 intValue = 3; }
  message Attribute { string key = 1; Value value = 2; }
  message Resource { repeated Attribute attributes = 1; }
  message Status { int32 code = 3; }
  message Span {
    bytes traceId = 1; bytes spanId = 2; bytes parentSpanId = 4;
    string name = 5; int32 kind = 6;
    repeated Attribute attributes = 9; Status status = 15;
  }
  message Scope { string name = 1; }
  message ScopeSpans { Scope scope = 1; repeated Span spans = 2; }
  message ResourceSpans { Resource resource = 1; repeated ScopeSpans scopeSpans = 2; }
  message Export { repeated ResourceSpans resourceSpans = 1; }
`,
  )
  .root.lookupType("Export");

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  kind: number;
  name: string;
  attributes: {
    key: string;
    value: { stringValue?: string; intValue?: string };
  }[];
  status?: { code?: number };
}
interface Export {
  resourceSpans: {
    resource: { attributes: { key: string; value: { stringValue: string } }[] };
    scopeSpans: { scope: { name: string }; spans: Span[] }[];
  }[];
}

describe("HTTP tracing export", () => {
  let directory: string;
  let receiver: Server;
  let endpoint: string;
  let child: ChildProcess | undefined;
  let exports: Export[];
  let paths: string[];
  let diagnostics: string;

  beforeEach(async () => {
    exports = [];
    paths = [];
    diagnostics = "";
    await mkdir(".tmp", { recursive: true });
    directory = await mkdtemp(resolve(".tmp/tracing-"));
    // Execute emitted ESM in Node rather than Vitest's module loader.
    const source = await readFile("src/telemetry/telemetry.ts", "utf8");
    await writeFile(
      `${directory}/telemetry.mjs`,
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText,
    );
    receiver = createServer(async (request, response) => {
      paths.push(request.url!);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const decoded = exportType.decode(Buffer.concat(chunks));
      exports.push(
        exportType.toObject(decoded, {
          bytes: String,
          longs: String,
        }) as Export,
      );
      response.setHeader("Content-Type", "application/x-protobuf");
      response.end();
    });
    receiver.listen(0, "127.0.0.1");
    await once(receiver, "listening");
    endpoint = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/custom/traces`;
  });

  afterEach(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    if (receiver)
      await new Promise<void>((done) => receiver.close(() => done()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function start(extraEnv: Record<string, string> = {}) {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("OTEL_")),
    );
    child = spawn(
      process.execPath,
      [
        "test/helpers/tracing-process.mjs",
        pathToFileURL(`${directory}/telemetry.mjs`).href,
      ],
      {
        env: {
          ...env,
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint,
          OTEL_BSP_SCHEDULE_DELAY: "60000",
          ...extraEnv,
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    child.stderr!.on("data", (chunk) => {
      diagnostics += String(chunk);
    });
    child.stdout!.on("data", (chunk) => {
      diagnostics += String(chunk);
    });
    const ready = once(child, "message");
    const exited = once(child, "exit").then(() => {
      throw new Error(diagnostics);
    });
    const [message] = await Promise.race([ready, exited]);
    return `http://127.0.0.1:${(message as { port: number }).port}`;
  }

  async function stop() {
    const exited = once(child!, "exit");
    child!.kill("SIGTERM");
    expect(await exited, diagnostics).toEqual([0, null]);
  }

  function spans() {
    return exports
      .flatMap((batch) => batch.resourceSpans)
      .flatMap((resource) => resource.scopeSpans)
      .flatMap((scope) => scope.spans);
  }

  function attributes(span: Span) {
    return Object.fromEntries(
      span.attributes.map(({ key, value }) => [
        key,
        value.stringValue ?? Number(value.intValue),
      ]),
    );
  }

  it("exports successful and failed server spans with propagated context on shutdown", async () => {
    const base = await start({
      OTEL_SERVICE_NAME: "tracing-test-api",
      OTEL_METRICS_EXPORTER: "otlp",
      OTEL_LOGS_EXPORTER: "otlp",
    });
    const traceId = "12345678901234567890123456789012";
    const parentId = "1234567890123456";
    expect(
      (
        await fetch(`${base}/success`, {
          headers: {
            traceparent: `00-${traceId}-${parentId}-01`,
            Authorization: "Bearer private-token",
          },
        })
      ).status,
    ).toBe(200);
    expect((await fetch(`${base}/failure`)).status).toBe(500);
    expect(
      (
        await fetch(`${base}/unsampled`, {
          headers: { traceparent: `00-${traceId}-${parentId}-00` },
        })
      ).status,
    ).toBe(200);
    expect(exports).toHaveLength(0); // batch has not flushed yet
    await stop();
    const serverSpans = spans().filter((span) => span.kind === 2);
    expect(serverSpans).toHaveLength(2);
    const success = serverSpans.find(
      (span) => attributes(span)["http.response.status_code"] === 200,
    )!;
    expect(Buffer.from(success.traceId, "base64").toString("hex")).toBe(
      traceId,
    );
    expect(Buffer.from(success.parentSpanId!, "base64").toString("hex")).toBe(
      parentId,
    );
    expect(
      serverSpans.find(
        (span) => attributes(span)["http.response.status_code"] === 500,
      )?.status?.code,
    ).toBe(2);
    expect(paths).toEqual(["/custom/traces"]);
    for (const resource of exports.flatMap((batch) => batch.resourceSpans)) {
      expect(resource.resource.attributes).toContainEqual({
        key: "service.name",
        value: { stringValue: "tracing-test-api" },
      });
      expect(
        resource.scopeSpans.every(
          (scope) => scope.scope.name === "@opentelemetry/instrumentation-http",
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(exports)).not.toContain("private-token");
  });

  it("excludes metrics and Swagger traffic while tracing outgoing HTTP with the default service name", async () => {
    const base = await start();
    for (const path of [
      "/metrics",
      "/metrics/?probe=1",
      "/api",
      "/api/",
      "/api/swagger-ui.css",
      "/api-json",
      "/api-yaml",
    ]) {
      expect((await fetch(base + path)).status).toBe(200);
    }
    expect((await fetch(`${base}/outgoing`)).status).toBe(200);
    await stop();
    expect(spans().filter((span) => span.kind === 2)).toHaveLength(2);
    const client = spans().find((span) => span.kind === 3)!;
    expect(client).toBeDefined();
    const parent = spans().find((span) => span.spanId === client.parentSpanId)!;
    expect(parent.kind).toBe(2);
    expect(parent.traceId).toBe(client.traceId);
    expect(exports[0].resourceSpans[0].resource.attributes).toContainEqual({
      key: "service.name",
      value: { stringValue: "immersion-tracker-api" },
    });
  });

  it("names HTTP spans using Express route templates without exporting Express layer spans", async () => {
    const base = await start({ TRACING_TEST_EXPRESS: "true" });
    for (const id of ["first-id", "second-id"]) {
      expect((await fetch(`${base}/content/${id}?view=details`)).status).toBe(
        200,
      );
    }
    expect((await fetch(`${base}/failure/third-id`)).status).toBe(500);
    expect((await fetch(`${base}/missing-route`)).status).toBe(404);
    // Ignoring the HTTP request must also suppress Express child spans.
    for (const path of ["/metrics", "/api", "/api-json"]) {
      expect((await fetch(base + path)).status).toBe(404);
    }
    await stop();
    const servers = spans().filter((span) => span.kind === 2);
    expect(servers.map((span) => span.name).sort()).toEqual([
      "GET",
      "GET /content/:id",
      "GET /content/:id",
      "GET /failure/:id",
    ]);
    for (const span of servers.filter((span) => span.name !== "GET")) {
      expect(attributes(span)["http.route"]).toBe(span.name.slice(4));
    }
    const expressSpans = exports
      .flatMap((batch) => batch.resourceSpans)
      .flatMap((resource) => resource.scopeSpans)
      .filter(
        (scope) =>
          scope.scope.name === "@opentelemetry/instrumentation-express",
      )
      .flatMap((scope) => scope.spans);
    expect(expressSpans).toEqual([]);
    expect(
      spans()
        .map((span) => span.name)
        .join(" "),
    ).not.toMatch(/first-id|second-id|third-id|view=details/);
  });

  it("does not export when OTEL_SDK_DISABLED is true", async () => {
    const base = await start({ OTEL_SDK_DISABLED: "true" });
    expect((await fetch(`${base}/success`)).status).toBe(200);
    await stop();
    expect(exports).toEqual([]);
  });

  it("continues serving requests and terminates if the collector is unavailable", async () => {
    const base = await start({
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:1/v1/traces",
    });
    expect((await fetch(`${base}/success`)).status).toBe(200);
    await stop();
  });
});
