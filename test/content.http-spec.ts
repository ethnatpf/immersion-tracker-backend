import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";
import { ContentService } from "../src/modules/content/content.service.js";
import { getModelToken } from "@nestjs/mongoose";
import { Model, mongo } from "mongoose";
import { Content } from "../src/modules/content/schemas/content.schema.js";

describe("POST /content", () => {
  let app: INestApplication;

  const validContent = {
    title: "A language immersion book",
    type: "book",
    language: "507f1f77bcf86cd799439011",
  };

  let token: string;
  let userId: string;

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization, {
      languageIds: [validContent.language],
    });
    token = fixture.createToken();
    userId = fixture.userId;
  });

  function postContent() {
    return request(app.getHttpServer())
      .post("/content")
      .set("Authorization", `Bearer ${token}`);
  }

  afterAll(async () => {
    await app?.close();
  });

  it("returns 409 with a clear message when content is duplicated", async () => {
    const model = app.get<Model<Content>>(getModelToken(Content.name));
    const save = vi.spyOn(model.prototype, "save").mockRejectedValueOnce(
      new mongo.MongoServerError({ code: 11000, message: "duplicate key" }),
    );
    try {
      const response = await postContent().send(validContent).expect(409);
      expect(response.body).toEqual({
        statusCode: 409,
        error: "Conflict",
        message: "You already have content with this title and type",
      });
    } finally {
      save.mockRestore();
    }
  });

  it("calls the service with the authenticated user and returns the created content", async () => {
    const create = vi.spyOn(app.get(ContentService), "create");
    try {
      const response = await postContent().send(validContent).expect(201);

      expect(create).toHaveBeenCalledExactlyOnceWith(validContent, userId);
      expect(response.body).toMatchObject({
        ...validContent,
        user_id: userId,
        completed: false,
      });
    } finally {
      create.mockRestore();
    }
  });

  it("uses the verified JWT subject even when the body supplies another owner", async () => {
    const response = await postContent()
      .send({ ...validContent, user_id: "auth0|another-user" })
      .expect(201);

    expect(response.body.user_id).toBe(userId);
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

  it.each([
    "not-an-id",
    "abcdefghijkl",
    "507f1f77bcf86cd79943901",
    "507f1f77bcf86cd7994390110",
    "507f1f77bcf86cd79943901z",
  ])(
    "rejects malformed language ID %s before calling the service",
    async (language) => {
      const create = vi.spyOn(app.get(ContentService), "create");
      try {
        await postContent()
          .send({ ...validContent, language })
          .expect(400);
        expect(create).not.toHaveBeenCalled();
      } finally {
        create.mockRestore();
      }
    },
  );

  it("rejects a valid ObjectId that does not reference an existing language", async () => {
    const response = await postContent()
      .send({ ...validContent, language: "507f1f77bcf86cd799439012" })
      .expect(400);

    expect(response.body.message).toBe("Language does not exist");
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
