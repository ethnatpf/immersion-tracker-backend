import "reflect-metadata";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { type Model, Types } from "mongoose";
import { ImmersionSessionsModule } from "../immersion-session.module.js";
import { ImmersionSessionService } from "../immersion-session.service.js";
import { ImmersionSession } from "../schemas/immersion-session.schema.js";
import {
  Content,
  ContentSchema,
} from "../../content/schemas/content.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";
import type { SessionHistoryItemResponseDto } from "../dto/session-history-response.dto.js";
import type { SessionHistoryDto } from "../dto/session-history.dto.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content" | "language"> & {
  content: Types.ObjectId;
  language: Types.ObjectId;
};

describe("ImmersionSessionService history database integration", () => {
  let module: TestingModule | undefined;
  let service: ImmersionSessionService;
  let sessions: Model<StoredSession>;
  let contents: Model<StoredContent>;
  let languages: Model<Language>;
  let languageId: Types.ObjectId;
  const userId = `auth0|history-${randomUUID()}`;
  const otherUserId = `auth0|history-${randomUUID()}`;
  const owners = { user_id: { $in: [userId, otherUserId] } };

  beforeAll(async () => {
    const uri = process.env.MONGODB_TEST_URL;
    if (!uri)
      throw new Error("MONGODB_TEST_URL is required for integration tests");
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          retryAttempts: 0,
          serverSelectionTimeoutMS: 5_000,
        }),
        MongooseModule.forFeature([
          { name: Content.name, schema: ContentSchema },
          { name: Language.name, schema: LanguageSchema },
        ]),
        ImmersionSessionsModule,
      ],
    }).compile();
    service = module.get(ImmersionSessionService);
    sessions = module.get<Model<StoredSession>>(
      getModelToken(ImmersionSession.name),
    );
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    await Promise.all([sessions.init(), contents.init()]);
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "History test language",
    });
    languageId = language._id;
  });

  afterEach(async () => {
    if (sessions) await sessions.deleteMany(owners);
    if (contents) await contents.deleteMany(owners);
  });

  afterAll(async () => {
    try {
      if (sessions) await sessions.deleteMany(owners);
      if (contents) await contents.deleteMany(owners);
      if (languages && languageId)
        await languages.deleteOne({ _id: languageId });
    } finally {
      await module?.close();
    }
  });

  function history(query: SessionHistoryDto = {}, owner = userId) {
    return service.history(query, owner);
  }

  async function content(
    title = "The Forest Chronicles",
    type: Content["type"] = "book",
    owner = userId,
  ) {
    return contents.create({
      title,
      type,
      user_id: owner,
      language: languageId,
      completed: true,
    });
  }

  async function seedSession(
    entry: Awaited<ReturnType<typeof content>>,
    date = "2026-10-13",
    duration = 1200,
    owner = userId,
    id = new Types.ObjectId(),
  ): Promise<SessionHistoryItemResponseDto> {
    const stored = await sessions.create({
      _id: id,
      content: entry._id,
      language: languageId,
      content_type: entry.type,
      user_id: owner,
      created_at: new Date(`${date}T00:00:00.000Z`),
      duration,
      progress: { unit: "page", start: 1, end: 10 },
    });
    return {
      id: stored._id.toHexString(),
      content_id: entry._id.toHexString(),
      title: entry.title,
      type: entry.type,
      created_at: stored.created_at.toISOString(),
      duration,
    };
  }

  it("returns persisted session and content IDs, title, type, UTC date, and duration in seconds", async () => {
    const expected = await seedSession(await content(), "2024-02-29", 1234);
    expect(await history()).toEqual({
      items: [expected],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("returns empty history with default pagination", async () => {
    expect(await history()).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it("keeps repeated sessions for the same content as separate entries, newest first", async () => {
    const entry = await content();
    const old = await seedSession(entry, "2026-10-10", 60);
    const recent = await seedSession(entry, "2026-10-13", 1800);
    expect(await history()).toEqual({
      items: [recent, old],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it.each([undefined, "", "   ", "forest", "forrest"])(
    "isolates each user's sessions for query %j",
    async (q) => {
      const ownContent = await content();
      const otherContent = await content(
        "The Forest Chronicles",
        "book",
        otherUserId,
      );
      const own = await seedSession(ownContent);
      const other = await seedSession(
        otherContent,
        "2026-10-13",
        300,
        otherUserId,
      );
      // A different owner's session referencing our content must also stay private.
      await seedSession(ownContent, "2026-10-12", 400, otherUserId);
      expect(await history({ q, limit: 1 })).toEqual({
        items: [own],
        total: 1,
        page: 1,
        limit: 1,
      });
      const otherHistory = await history({ q }, otherUserId);
      expect(otherHistory.items).toContainEqual(other);
      expect(otherHistory.items.map(({ id }) => id)).not.toContain(own.id);
    },
  );

  it.each(["fOrEsT", "  forest  ", "orest", "The Forest Chronicles"])(
    "matches case-insensitive trimmed substrings %j",
    async (q) => {
      const expected = await seedSession(await content());
      await seedSession(await content("Ocean"));
      expect(await history({ q })).toEqual({
        items: [expected],
        total: 1,
        page: 1,
        limit: 20,
      });
    },
  );

  it.each(["forrest", "forst", "forezt", "foerst"])(
    "tolerates one edit in a title word: %s",
    async (q) => {
      const expected = await seedSession(await content());
      await seedSession(await content("Ocean"));
      expect(await history({ q })).toEqual({
        items: [expected],
        total: 1,
        page: 1,
        limit: 20,
      });
    },
  );

  it("allows typo matching at four characters but requires literal matching below four", async () => {
    const dune = await seedSession(await content("Dune"));
    const cat = await seedSession(await content("Cat"));
    await seedSession(await content("Cut"));
    expect((await history({ q: "duna" })).items).toEqual([dune]);
    expect((await history({ q: "cat" })).items).toEqual([cat]);
  });

  it.each(["farast", "forest chroniclez", "ocean"])(
    "excludes two-edit, fuzzy multiword, and unrelated matches: %s",
    async (q) => {
      await seedSession(await content());
      expect(await history({ q })).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    },
  );

  it.each([".", "*", "[", "a+b"])(
    "treats %s as literal search text",
    async (q) => {
      const expected = await seedSession(await content(`Symbol ${q} story`));
      await seedSession(await content("Ordinary story"));
      expect((await history({ q })).items).toEqual([expected]);
    },
  );

  it.each(["anime", "book", "manga", "drama", "video"] as const)(
    "filters by content type %s",
    async (type) => {
      const expected = await seedSession(await content("Forest", type));
      await seedSession(
        await content("Ocean", type === "book" ? "anime" : "book"),
      );
      expect(await history({ type })).toEqual({
        items: [expected],
        total: 1,
        page: 1,
        limit: 20,
      });
    },
  );

  it("filters by content ID before counting and paginating", async () => {
    const entry = await content();
    const older = await seedSession(entry, "2026-10-11");
    const newer = await seedSession(entry, "2026-10-12");
    await seedSession(await content("Forest adventures"), "2026-10-13");
    await seedSession(entry, "2026-10-13", 60, otherUserId);
    const query = { content: entry._id.toHexString(), limit: 1 };
    expect(await history(query)).toEqual({
      items: [newer],
      total: 2,
      page: 1,
      limit: 1,
    });
    expect(await history({ ...query, page: 2 })).toEqual({
      items: [older],
      total: 2,
      page: 2,
      limit: 1,
    });
    expect(await history({ ...query, page: 3 })).toEqual({
      items: [],
      total: 2,
      page: 3,
      limit: 1,
    });
  });

  it("returns empty history for nonexistent or another user's content ID", async () => {
    await seedSession(await content());
    const otherContent = await content(
      "Other user's content",
      "book",
      otherUserId,
    );
    await seedSession(otherContent, "2026-10-13", 60, otherUserId);
    for (const id of [new Types.ObjectId(), otherContent._id]) {
      const query = { content: id.toHexString(), page: 2 };
      expect(await history(query)).toEqual({
        items: [],
        total: 0,
        page: 2,
        limit: 20,
      });
    }
  });

  it("supports inclusive, single-day, and open-ended date ranges using session dates", async () => {
    const entry = await content();
    const before = await seedSession(entry, "2024-02-28");
    const start = await seedSession(entry, "2024-02-29");
    const end = await seedSession(entry, "2024-03-01");
    const after = await seedSession(entry, "2024-03-02");
    for (const [query, items] of [
      [{ start_date: "2024-02-29", end_date: "2024-03-01" }, [end, start]],
      [{ start_date: "2024-02-29", end_date: "2024-02-29" }, [start]],
      [{ start_date: "2024-03-01" }, [after, end]],
      [{ end_date: "2024-02-29" }, [start, before]],
      [{ start_date: "2025-01-01" }, []],
    ] as const) {
      expect(await history(query)).toEqual({
        items,
        total: items.length,
        page: 1,
        limit: 20,
      });
    }
  });

  it("applies ownership, fuzzy title, type, and date filters before counting and paginating", async () => {
    const entry = await content();
    const first = await seedSession(entry, "2026-10-12");
    const second = await seedSession(entry, "2026-10-11");
    await seedSession(entry, "2026-10-13", 60, otherUserId);
    await seedSession(entry, "2026-10-10");
    await seedSession(entry, "2026-10-14");
    await seedSession(await content("Forest", "anime"), "2026-10-13");
    await seedSession(await content("Ocean"), "2026-10-13");
    await seedSession(await content("Forest adventures"), "2026-10-13");
    const query = {
      content: entry._id.toHexString(),
      q: "forrest",
      type: "book" as const,
      start_date: "2026-10-11",
      end_date: "2026-10-13",
      limit: 1,
    };
    expect(await history(query)).toEqual({
      items: [first],
      total: 2,
      page: 1,
      limit: 1,
    });
    expect(await history({ ...query, page: 2 })).toEqual({
      items: [second],
      total: 2,
      page: 2,
      limit: 1,
    });
    expect(await history({ ...query, page: 3 })).toEqual({
      items: [],
      total: 2,
      page: 3,
      limit: 1,
    });
  });

  it("paginates newest first with a default limit of 20", async () => {
    const entry = await content();
    const expected: SessionHistoryItemResponseDto[] = [];
    for (let day = 1; day <= 25; day++) {
      expected.unshift(
        await seedSession(entry, `2026-09-${String(day).padStart(2, "0")}`),
      );
    }
    expect(await history()).toEqual({
      items: expected.slice(0, 20),
      total: 25,
      page: 1,
      limit: 20,
    });
    expect(await history({ page: 2 })).toEqual({
      items: expected.slice(20),
      total: 25,
      page: 2,
      limit: 20,
    });
  });

  it("breaks equal-date ties by descending session ID consistently across pages", async () => {
    const entry = await content();
    const high = await seedSession(
      entry,
      "2026-10-13",
      60,
      userId,
      new Types.ObjectId("507f1f77bcf86cd799439013"),
    );
    const low = await seedSession(
      entry,
      "2026-10-13",
      60,
      userId,
      new Types.ObjectId("507f1f77bcf86cd799439011"),
    );
    const middle = await seedSession(
      entry,
      "2026-10-13",
      60,
      userId,
      new Types.ObjectId("507f1f77bcf86cd799439012"),
    );
    for (const [index, item] of [high, middle, low].entries()) {
      expect(await history({ page: index + 1, limit: 1 })).toEqual({
        items: [item],
        total: 3,
        page: index + 1,
        limit: 1,
      });
    }
  });
});
