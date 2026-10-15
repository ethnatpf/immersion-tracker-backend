import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ImmersionSessionService } from "../src/modules/immersion-session/immersion-session.service.js";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";

describe("GET /immersion-session", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  const history = vi.fn<ImmersionSessionService["history"]>();
  const result = {
    items: [
      {
        id: "507f1f77bcf86cd799439011",
        content_id: "507f1f77bcf86cd799439012",
        title: "The Forest Chronicles",
        type: "book" as const,
        created_at: "2026-10-13T00:00:00.000Z",
        duration: 1200,
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  };

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    token = fixture.createToken();
    userId = fixture.userId;
    // HTTP behavior only; matching and persistence use the real service below.
    Object.assign(app.get(ImmersionSessionService), { history });
  });

  beforeEach(() => {
    history.mockReset();
    history.mockResolvedValue(result);
  });

  afterAll(async () => {
    await app?.close();
  });

  function getHistory() {
    return request(app.getHttpServer())
      .get("/immersion-session")
      .set("Authorization", `Bearer ${token}`);
  }

  it.each([undefined, "", "   "])(
    "browses with query %j and default pagination",
    async (q) => {
      const response = await getHistory()
        .query(q === undefined ? {} : { q })
        .expect(200);
      expect(response.body).toEqual(result);
      expect(history).toHaveBeenCalledExactlyOnceWith(
        expect.any(Object),
        userId,
      );
    },
  );

  it.each([
    { q: "forrest" },
    { content: "507f1f77bcf86cd799439012" },
    { type: "anime" },
    { start_date: "2024-02-29" },
    { end_date: "2026-10-13" },
    { start_date: "2026-10-13", end_date: "2026-10-13" },
    {
      content: "507f1f77bcf86cd799439012",
      q: "forrest",
      type: "book",
      start_date: "2024-02-29",
      end_date: "2026-10-13",
    },
  ])("passes filters and the verified identity: %j", async (query) => {
    await getHistory().query(query).expect(200);
    expect(history).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(query),
      userId,
    );
  });

  it("trims the title query", async () => {
    await getHistory().query({ q: "  forest  " }).expect(200);
    expect(history).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ q: "forest" }),
      userId,
    );
  });

  it.each(["anime", "book", "manga", "drama", "video"])(
    "accepts type %s",
    async (type) => {
      await getHistory().query({ type }).expect(200);
      expect(history).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type }),
        userId,
      );
    },
  );

  it("accepts a title query of 350 characters", async () => {
    await getHistory()
      .query({ q: "a".repeat(350) })
      .expect(200);
  });

  it.each([1, 20])("converts page and limit %i to numbers", async (limit) => {
    const pageResult = { ...result, page: 2, limit };
    history.mockResolvedValueOnce(pageResult);
    const response = await getHistory()
      .query({ page: "2", limit: String(limit) })
      .expect(200);
    expect(response.body).toEqual(pageResult);
    expect(history).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ page: 2, limit }),
      userId,
    );
  });

  it("uses the JWT subject when an owner is supplied in the query", async () => {
    await getHistory().query({ user_id: "auth0|another-user" }).expect(200);
    expect(history).toHaveBeenCalledExactlyOnceWith(expect.any(Object), userId);
  });

  it("returns empty items and pagination metadata", async () => {
    const empty = { items: [], total: 0, page: 1, limit: 20 };
    history.mockResolvedValueOnce(empty);
    const response = await getHistory().expect(200);
    expect(response.body).toEqual(empty);
  });

  it.each([
    ...[
      "",
      "not-an-id",
      "abcdefghijkl",
      "507f1f77bcf86cd79943901",
      "507f1f77bcf86cd7994390110",
      "507f1f77bcf86cd79943901z",
    ].map((value) => `content=${value}`),
    "content=507f1f77bcf86cd799439011&content=507f1f77bcf86cd799439012",
    "type=podcast",
    "type=BOOK",
    "type=",
    "type=book&type=anime",
    `q=${"a".repeat(351)}`,
    "q=forest&q=ocean",
    ...["start_date", "end_date"].flatMap((field) =>
      [
        "",
        "not-a-date",
        "2026-02-29",
        "2024-02-30",
        "2026-04-31",
        "2026-00-01",
        "2026-13-01",
        "2026-01-00",
        "2026-1-2",
        "13/10/2026",
        "2026-10-13T00:00:00Z",
        " 2026-10-13 ",
      ].map((value) => `${field}=${encodeURIComponent(value)}`),
    ),
    "start_date=2026-10-14&end_date=2026-10-13",
    "start_date=2026-10-12&start_date=2026-10-13",
    "end_date=2026-10-12&end_date=2026-10-13",
    ...["page", "limit"].flatMap((field) =>
      ["0", "-1", "1.5", "abc", "", "Infinity", "NaN"].map(
        (value) => `${field}=${value}`,
      ),
    ),
    "page=1&page=2",
    "limit=1&limit=2",
    "limit=21",
  ])("rejects invalid query %s before invoking the service", async (query) => {
    await getHistory().query(query).expect(400);
    expect(history).not.toHaveBeenCalled();
  });
});
