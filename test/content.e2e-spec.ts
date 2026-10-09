import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ContentModule } from "../src/modules/content/content.module.js";
import { Content } from "../src/modules/content/schemas/content.schema.js";

// Support either Model.create() or new Model().save() without connecting to MongoDB.
class ContentModelStub {
  constructor(values: Record<string, unknown>) {
    Object.assign(this, values);
  }

  static async create(values: Record<string, unknown>) {
    return new ContentModelStub(values);
  }

  async save() {
    return this;
  }
}

describe("POST /content validation", () => {
  let app: INestApplication;

  const validContent = {
    title: "A language immersion book",
    type: "book",
    language: "507f1f77bcf86cd799439011",
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ContentModule],
    })
      .overrideProvider(getModelToken(Content.name))
      .useValue(ContentModelStub)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(["title", "type", "language"] as const)(
    "required field: %s",
    (field) => {
      it("rejects an omitted value", async () => {
        const body: Record<string, unknown> = { ...validContent };
        delete body[field];

        await request(app.getHttpServer()).post("/content").send(body).expect(400);
      });

      it.each([null, "", 42, true, [], {}].map((value) => ({ value })))(
        "rejects invalid value $value",
        async ({ value }) => {
          await request(app.getHttpServer())
            .post("/content")
            .send({ ...validContent, [field]: value })
            .expect(400);
        },
      );
    },
  );

  it("rejects a title longer than 350 characters", async () => {
    await request(app.getHttpServer())
      .post("/content")
      .send({ ...validContent, title: "a".repeat(351) })
      .expect(400);
  });

  it.each(["podcast", "BOOK", "movie"])(
    "rejects unsupported content type %s",
    async (type) => {
      await request(app.getHttpServer())
        .post("/content")
        .send({ ...validContent, type })
        .expect(400);
    },
  );

  it.each([
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
  ].map((url) => ({ url })))("rejects invalid URL $url", async ({ url }) => {
    await request(app.getHttpServer())
      .post("/content")
      .send({ ...validContent, url })
      .expect(400);
  });

  it.each(["anime", "book", "manga", "drama", "video"])(
    "accepts supported type %s with the optional URL omitted",
    async (type) => {
      await request(app.getHttpServer())
        .post("/content")
        .send({ ...validContent, type })
        .expect(201);
    },
  );

  it("accepts a title of exactly 350 characters", async () => {
    await request(app.getHttpServer())
      .post("/content")
      .send({ ...validContent, title: "a".repeat(350) })
      .expect(201);
  });

  it.each([
    "http://example.com/books/123",
    "https://example.com/books/123?language=ja#chapter-1",
  ])("accepts valid web URL %s", async (url) => {
    await request(app.getHttpServer())
      .post("/content")
      .send({ ...validContent, url })
      .expect(201);
  });
});
