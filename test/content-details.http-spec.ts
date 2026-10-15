import "reflect-metadata";
import { NotFoundException, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { ContentService } from "../src/modules/content/content.service.js";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";
import type { ContentDetails } from "../src/modules/content/interfaces/content-details.interface.js";

describe("GET /content/:id", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  const contentId = "507f1f77bcf86cd799439011";
  const getById = vi.fn<ContentService["getById"]>();
  const result: ContentDetails = {
    id: contentId,
    title: "The Forest Chronicles",
    type: "book",
    completed: false,
    totalTimeSpent: 1837,
    lastImmersionSession: {
      id: "507f1f77bcf86cd799439012",
      created_at: "2026-10-13T00:00:00.000Z",
      duration: 1237,
      progress: { unit: "page", start: 11, end: 25 },
    },
  };

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    token = fixture.createToken();
    userId = fixture.userId;
    // Only HTTP behavior is mocked; ownership and totals use MongoDB below.
    Object.assign(app.get(ContentService), { getById });
  });

  beforeEach(() => {
    getById.mockReset();
    getById.mockResolvedValue(result);
  });

  afterAll(async () => {
    await app?.close();
  });

  function getContent(id = contentId) {
    return request(app.getHttpServer())
      .get(`/content/${id}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it("returns content details and the latest session using the verified JWT subject", async () => {
    const response = await getContent().expect(200);
    expect(response.body).toEqual(result);
    expect(getById).toHaveBeenCalledExactlyOnceWith(contentId, userId);
  });

  it("uses the JWT subject even when another owner is supplied", async () => {
    await getContent()
      .query({ user_id: "auth0|another-user" })
      .send({ user_id: "auth0|another-user" })
      .expect(200);
    expect(getById).toHaveBeenCalledExactlyOnceWith(contentId, userId);
  });

  it("returns zero seconds and a null latest session for content without sessions", async () => {
    const empty = { ...result, totalTimeSpent: 0, lastImmersionSession: null };
    getById.mockResolvedValueOnce(empty);
    const response = await getContent().expect(200);
    expect(response.body).toEqual(empty);
  });

  it("returns 404 when the service cannot find owned content", async () => {
    getById.mockRejectedValueOnce(new NotFoundException());
    const response = await getContent().expect(404);
    expect(response.body).toMatchObject({ statusCode: 404 });
    expect(getById).toHaveBeenCalledExactlyOnceWith(contentId, userId);
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
      await getContent(id).expect(400);
      expect(getById).not.toHaveBeenCalled();
    },
  );
});
