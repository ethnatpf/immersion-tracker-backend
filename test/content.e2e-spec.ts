import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";

describe("POST /content validation", () => {
  let app: INestApplication;

  const validContent = {
    title: "A language immersion book",
    type: "book",
    language: "507f1f77bcf86cd799439011",
  };

  let token: string;

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    token = fixture.createToken();
  });

  function postContent() {
    return request(app.getHttpServer())
      .post("/content")
      .set("Authorization", `Bearer ${token}`);
  }

  afterAll(async () => {
    await app?.close();
  });

  describe.each(["title", "type", "language"] as const)(
    "required field: %s",
    (field) => {
      it("rejects an omitted value", async () => {
        const body: Record<string, unknown> = { ...validContent };
        delete body[field];

        await postContent().send(body).expect(400);
      });

      it.each([null, "", 42, true, [], {}].map((value) => ({ value })))(
        "rejects invalid value $value",
        async ({ value }) => {
          await postContent()
            .send({ ...validContent, [field]: value })
            .expect(400);
        },
      );
    },
  );

  it("rejects a title longer than 350 characters", async () => {
    await postContent()
      .send({ ...validContent, title: "a".repeat(351) })
      .expect(400);
  });

  it.each(["podcast", "BOOK", "movie"])(
    "rejects unsupported content type %s",
    async (type) => {
      await postContent()
        .send({ ...validContent, type })
        .expect(400);
    },
  );

  it.each(
    [
      "",
      "not a url",
      "/books/123",
      "example.com/books/123",
      "https://",
      "https://exa mple.com",
      "ftp://example.com/book",
      "javascript:alert(1)",
      null,
      42,
      true,
      [],
      {},
    ].map((url) => ({ url })),
  )("rejects invalid URL $url", async ({ url }) => {
    await postContent()
      .send({ ...validContent, url })
      .expect(400);
  });

  it.each(["anime", "book", "manga", "drama", "video"])(
    "accepts supported type %s with the optional URL omitted",
    async (type) => {
      await postContent()
        .send({ ...validContent, type })
        .expect(201);
    },
  );

  it("accepts a title of exactly 350 characters", async () => {
    await postContent()
      .send({ ...validContent, title: "a".repeat(350) })
      .expect(201);
  });

  it.each([
    "http://example.com/books/123",
    "https://example.com/books/123?language=ja#chapter-1",
  ])("accepts valid web URL %s", async (url) => {
    await postContent()
      .send({ ...validContent, url })
      .expect(201);
  });
});
