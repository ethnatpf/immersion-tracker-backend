import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ContentService } from "../src/modules/content/content.service.js";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";

describe("GET /content/search", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  const language = "507f1f77bcf86cd799439011";
  const search = vi.fn<ContentService["search"]>();
  const result = {
    items: [
      {
        id: "507f1f77bcf86cd799439012",
        title: "A book",
        type: "book" as const,
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
    // Isolate HTTP behavior; persistence and matching use the real service in integration tests.
    Object.assign(app.get(ContentService), { search });
  });

  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue(result);
  });

  afterAll(async () => {
    await app?.close();
  });

  function getSearch() {
    return request(app.getHttpServer())
      .get("/content/search")
      .set("Authorization", `Bearer ${token}`);
  }

  it.each([
    { q: "book" },
    { q: "book", language },
    { q: "book", type: "book" },
    { q: "book", language, type: "book" },
  ])(
    "accepts filters $language / $type and passes the verified identity",
    async (query) => {
      const response = await getSearch().query(query).expect(200);
      expect(response.body).toEqual(result);
      expect(search).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining(query),
        userId,
      );
    },
  );

  it.each([undefined, "", "   "])(
    "browses for query %j with default pagination",
    async (q) => {
      const response = await getSearch()
        .query(q === undefined ? {} : { q })
        .expect(200);
      expect(response.body).toEqual(result);
      expect(search).toHaveBeenCalledOnce();
      expect(search.mock.calls[0]?.[1]).toBe(userId);
    },
  );

  it("trims surrounding query whitespace", async () => {
    await getSearch().query({ q: "  book  " }).expect(200);
    expect(search).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ q: "book" }),
      userId,
    );
  });

  it("accepts a query of exactly 350 characters", async () => {
    await getSearch()
      .query({ q: "a".repeat(350) })
      .expect(200);
  });

  it.each(["anime", "book", "manga", "drama", "video"])(
    "accepts content type %s",
    async (type) => {
      await getSearch().query({ type }).expect(200);
      expect(search).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type }),
        userId,
      );
    },
  );

  it.each([1, 20])(
    "accepts limit %i and converts pagination values to numbers",
    async (limit) => {
      const pageResult = { ...result, page: 2, limit };
      search.mockResolvedValueOnce(pageResult);
      const response = await getSearch()
        .query({ page: "2", limit: String(limit) })
        .expect(200);
      expect(response.body).toEqual(pageResult);
      expect(search).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ page: 2, limit }),
        userId,
      );
    },
  );

  it("uses the JWT subject when another owner is supplied", async () => {
    await getSearch()
      .query({ q: "book", user_id: "auth0|another-user" })
      .expect(200);
    expect(search.mock.calls[0]?.[1]).toBe(userId);
  });

  it("returns empty items with pagination metadata", async () => {
    const empty = { items: [], total: 0, page: 1, limit: 20 };
    search.mockResolvedValueOnce(empty);
    const response = await getSearch().query({ q: "missing" }).expect(200);
    expect(response.body).toEqual(empty);
  });

  it.each([
    "language=not-an-id",
    "language=abcdefghijkl",
    "language=507f1f77bcf86cd79943901",
    "language=507f1f77bcf86cd7994390110",
    "language=507f1f77bcf86cd79943901z",
    "language=",
    "type=podcast",
    "type=BOOK",
    "type=movie",
    "type=",
    `q=${"a".repeat(351)}`,
    "q=book&q=anime",
    `language=${language}&language=${language}`,
    "type=book&type=anime",
    ...["page", "limit"].flatMap((field) =>
      ["0", "-1", "1.5", "abc", "", "Infinity", "NaN"].map(
        (value) => `${field}=${value}`,
      ),
    ),
    "page=1&page=2",
    "limit=1&limit=2",
    "limit=21",
  ])("rejects invalid query %s before calling the service", async (query) => {
    await getSearch().query(query).expect(400);
    expect(search).not.toHaveBeenCalled();
  });
});
