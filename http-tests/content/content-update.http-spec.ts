import "reflect-metadata";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type INestApplication,
} from "@nestjs/common";
import request from "supertest";
import { Mongoose } from "mongoose";
import { ContentService } from "~/modules/content/content.service.js";
import {
  Content,
  ContentSchema,
} from "~/modules/content/schemas/content.schema.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("PATCH /content/:id", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  const contentId = "507f1f77bcf86cd799439011";
  const languageId = "507f1f77bcf86cd799439012";
  const otherLanguageId = "507f1f77bcf86cd799439013";
  const update = vi.fn<ContentService["update"]>();
  const contentModel = new Mongoose().model(Content.name, ContentSchema);
  const result = {
    _id: contentId,
    title: "The Forest Chronicles",
    type: "book",
    user_id: "auth0|test-user",
    language: languageId,
    completed: false,
    url: "https://example.com/content",
  };

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    token = fixture.createToken();
    userId = fixture.userId;
    // Real persistence and ownership checks belong to the integration suite.
    Object.assign(app.get(ContentService), { update });
  });

  beforeEach(() => {
    update.mockReset();
    update.mockResolvedValue(new contentModel(result));
  });

  afterAll(async () => {
    await app?.close();
  });

  function patch(id = contentId) {
    return request(app.getHttpServer())
      .patch(`/content/${id}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it.each([
    { title: "Updated title" },
    { title: "a".repeat(350) },
    { completed: true },
    { completed: false },
    { language: otherLanguageId },
    { title: "Updated title", completed: true, language: otherLanguageId },
  ])(
    "accepts a partial update and returns the updated content: %j",
    async (input) => {
      update.mockResolvedValueOnce(
        new contentModel({ ...result, ...input, user_id: userId, __v: 0 }),
      );
      const response = await patch().send(input).expect(200);

      expect(response.body).toEqual({ ...result, ...input, user_id: userId });
      expect(update).toHaveBeenCalledExactlyOnceWith(
        contentId,
        expect.objectContaining(input),
        userId,
      );
      const forwarded = update.mock.calls[0]![1];
      for (const field of ["title", "completed", "language"] as const) {
        if (!(field in input)) expect(forwarded[field]).toBeUndefined();
      }
    },
  );

  it("uses the JWT subject despite an owner supplied in the body and query", async () => {
    await patch()
      .query({ user_id: "auth0|another-user" })
      .send({ title: "Updated title", user_id: "auth0|another-user" })
      .expect(200);

    expect(update).toHaveBeenCalledExactlyOnceWith(
      contentId,
      expect.objectContaining({ title: "Updated title" }),
      userId,
    );
  });

  it("returns 404 when the service cannot find owned content", async () => {
    update.mockRejectedValueOnce(new NotFoundException("Content not found"));
    const response = await patch().send({ completed: true }).expect(404);

    expect(response.body.message).toBe("Content not found");
    expect(update).toHaveBeenCalledExactlyOnceWith(
      contentId,
      expect.objectContaining({ completed: true }),
      userId,
    );
  });

  it("returns 400 when the language does not exist", async () => {
    update.mockRejectedValueOnce(
      new BadRequestException("Language does not exist"),
    );
    const response = await patch()
      .send({ language: otherLanguageId })
      .expect(400);

    expect(response.body.message).toBe("Language does not exist");
    expect(update).toHaveBeenCalledExactlyOnceWith(
      contentId,
      expect.objectContaining({ language: otherLanguageId }),
      userId,
    );
  });

  it("returns 409 when the updated title conflicts with the user's existing content", async () => {
    update.mockRejectedValueOnce(
      new ConflictException(
        "You already have content with this title and type",
      ),
    );
    const response = await patch()
      .send({ title: "Existing title" })
      .expect(409);

    expect(response.body.message).toBe(
      "You already have content with this title and type",
    );
  });

  it.each([
    "not-an-id",
    "abcdefghijkl",
    "507f1f77bcf86cd79943901",
    "507f1f77bcf86cd7994390110",
    "507f1f77bcf86cd79943901z",
  ])(
    "rejects malformed content ID %s before invoking the service",
    async (id) => {
      await patch(id).send({ completed: true }).expect(400);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each(
    [null, "", 42, true, [], {}, "a".repeat(351)].map((title) => ({ title })),
  )(
    "rejects invalid title $title before invoking the service",
    async (body) => {
      await patch().send(body).expect(400);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each(
    [null, "true", "false", "", 0, 1, [], {}].map((completed) => ({
      completed,
    })),
  )(
    "rejects invalid completion status $completed before invoking the service",
    async (body) => {
      await patch().send(body).expect(400);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      null,
      "",
      42,
      true,
      [],
      {},
      "not-an-id",
      "abcdefghijkl",
      "507f1f77bcf86cd79943901",
      "507f1f77bcf86cd7994390110",
      "507f1f77bcf86cd79943901z",
    ].map((language) => ({ language })),
  )(
    "rejects invalid language $language before invoking the service",
    async (body) => {
      await patch().send(body).expect(400);
      expect(update).not.toHaveBeenCalled();
    },
  );
});
