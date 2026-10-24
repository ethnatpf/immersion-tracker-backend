import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { type Model, Types } from "mongoose";
import { ContentModule } from "../content.module.js";
import { ContentService } from "../content.service.js";
import { Content } from "../schemas/content.schema.js";
import {
  ImmersionSession,
  ImmersionSessionSchema,
  type SessionProgress,
} from "../../immersion-session/schemas/immersion-session.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";
import type { ContentDetailsResponseDto } from "../dto/content-details-response.dto.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content" | "language"> & {
  content: Types.ObjectId;
  language: Types.ObjectId;
};

describe("ContentService getById database integration", () => {
  let module: TestingModule | undefined;
  let service: ContentService;
  let contents: Model<StoredContent>;
  let sessions: Model<StoredSession>;
  let languages: Model<Language>;
  let languageId: Types.ObjectId;
  const userId = `auth0|content-details-${randomUUID()}`;
  const otherUserId = `auth0|content-details-${randomUUID()}`;
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
          { name: ImmersionSession.name, schema: ImmersionSessionSchema },
          { name: Language.name, schema: LanguageSchema },
        ]),
        ContentModule,
      ],
    }).compile();
    service = module.get(ContentService);
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    sessions = module.get<Model<StoredSession>>(
      getModelToken(ImmersionSession.name),
    );
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    await Promise.all([contents.init(), sessions.init()]);
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Content details test language",
      nativeName: "Content details test language",
    });
    languageId = language._id;
  });

  async function cleanup() {
    if (sessions) await sessions.deleteMany(owners);
    if (contents) await contents.deleteMany(owners);
  }

  afterEach(cleanup);

  afterAll(async () => {
    try {
      await cleanup();
      if (languages && languageId)
        await languages.deleteOne({ _id: languageId });
    } finally {
      await module?.close();
    }
  });

  function seedContent(
    title = "The Forest Chronicles",
    completed = false,
    owner = userId,
    type: Content["type"] = "book",
  ) {
    return contents.create({
      title,
      type,
      completed,
      user_id: owner,
      language: languageId,
      url: "https://example.com/content",
    });
  }

  async function seedSession(
    content: Types.ObjectId,
    date: string,
    duration: number,
    options: {
      owner?: string;
      progress?: SessionProgress;
      id?: Types.ObjectId;
    } = {},
  ): Promise<NonNullable<ContentDetailsResponseDto["lastImmersionSession"]>> {
    const entry = await contents.findById(content).orFail().exec();
    const stored = await sessions.create({
      language: entry.language,
      content_type: entry.type,
      _id: options.id ?? new Types.ObjectId(),
      content,
      created_at: new Date(`${date}T00:00:00.000Z`),
      duration,
      user_id: options.owner ?? userId,
      progress: options.progress,
    });
    return {
      id: stored._id.toHexString(),
      created_at: stored.created_at.toISOString(),
      duration,
      ...(options.progress ? { progress: options.progress } : {}),
    };
  }

  it("returns persisted details, total seconds, and the latest session by date rather than insertion order", async () => {
    const content = await seedContent();
    const latest = await seedSession(content._id, "2026-10-13", 1237, {
      progress: { unit: "page", start: 11, end: 25 },
    });
    await seedSession(content._id, "2026-10-10", 600, {
      progress: { unit: "page", start: 100, end: 110 },
    });

    expect(await service.getById(content._id.toHexString(), userId)).toEqual({
      id: content._id.toHexString(),
      title: content.title,
      type: "book",
      completed: false,
      totalTimeSpent: 1837,
      lastImmersionSession: latest,
    });
  });

  it.each([false, true])(
    "returns completion status %s with zero seconds and null session for empty history",
    async (completed) => {
      const content = await seedContent("Empty history", completed);
      expect(await service.getById(content._id.toHexString(), userId)).toEqual({
        id: content._id.toHexString(),
        title: "Empty history",
        type: "book",
        completed,
        totalTimeSpent: 0,
        lastImmersionSession: null,
      });
    },
  );

  it("excludes other content and other users' sessions from the total and latest session", async () => {
    const content = await seedContent();
    const own = await seedSession(content._id, "2026-10-10", 61);
    const sibling = await seedContent("Another owned book");
    await seedSession(sibling._id, "2026-10-14", 300);
    const other = await seedContent("Other user's book", false, otherUserId);
    await seedSession(other._id, "2026-10-14", 400, { owner: otherUserId });
    // Even an inconsistent foreign-owned session referencing our content is private.
    await seedSession(content._id, "2026-10-15", 9000, { owner: otherUserId });

    expect(
      await service.getById(content._id.toHexString(), userId),
    ).toMatchObject({
      totalTimeSpent: 61,
      lastImmersionSession: own,
    });
  });

  it("returns empty history when only another user's sessions reference the content", async () => {
    const content = await seedContent();
    await seedSession(content._id, "2026-10-13", 9000, { owner: otherUserId });
    expect(
      await service.getById(content._id.toHexString(), userId),
    ).toMatchObject({
      totalTimeSpent: 0,
      lastImmersionSession: null,
    });
  });

  it("rejects another user's content while allowing its actual owner to read it", async () => {
    const content = await seedContent("Private book", true, otherUserId);
    await seedSession(content._id, "2026-10-13", 1200, { owner: otherUserId });
    // Having a session referencing foreign content does not grant access to it.
    await seedSession(content._id, "2026-10-14", 600);
    await expect(
      service.getById(content._id.toHexString(), userId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await service.getById(content._id.toHexString(), otherUserId),
    ).toMatchObject({
      title: "Private book",
      completed: true,
      totalTimeSpent: 1200,
    });
  });

  it("returns not found for a valid nonexistent content ID", async () => {
    await seedContent();
    await expect(
      service.getById(new Types.ObjectId().toHexString(), userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the latest session without inventing progress when progress was omitted", async () => {
    const content = await seedContent();
    await seedSession(content._id, "2026-10-10", 60, {
      progress: { unit: "page", start: 1, end: 10 },
    });
    const latest = await seedSession(content._id, "2026-10-13", 120);
    const result = await service.getById(content._id.toHexString(), userId);
    expect(result.lastImmersionSession).toEqual(latest);
    expect(result.totalTimeSpent).toBe(180);
  });

  it("preserves episode progress for anime content", async () => {
    const content = await seedContent("Forest anime", false, userId, "anime");
    const latest = await seedSession(content._id, "2026-10-13", 1440, {
      progress: { unit: "episode", start: 2, end: 2 },
    });
    expect(
      await service.getById(content._id.toHexString(), userId),
    ).toMatchObject({
      type: "anime",
      totalTimeSpent: 1440,
      lastImmersionSession: latest,
    });
  });

  it.each([
    { type: "book", unit: "page" },
    { type: "anime", unit: "episode" },
  ] as const)(
    "uses the highest progress end on the same day for $unit progress, before session ID or insertion order",
    async ({ type, unit }) => {
      const content = await seedContent(
        "Same-day progress",
        false,
        userId,
        type,
      );
      const lowerId = new Types.ObjectId();
      const higherId = new Types.ObjectId();
      const latest = await seedSession(content._id, "2026-10-13", 120, {
        id: lowerId,
        progress: { unit, start: 1, end: 30 },
      });
      await seedSession(content._id, "2026-10-13", 60, {
        id: higherId,
        progress: { unit, start: 20, end: 25 },
      });
      const result = await service.getById(content._id.toHexString(), userId);
      expect(result.lastImmersionSession).toEqual(latest);
      expect(result.totalTimeSpent).toBe(180);
    },
  );

  it("prefers recorded progress over missing progress on the same day", async () => {
    const content = await seedContent();
    const latest = await seedSession(content._id, "2026-10-13", 120, {
      progress: { unit: "page", start: 1, end: 10 },
    });
    await seedSession(content._id, "2026-10-13", 60);
    const result = await service.getById(content._id.toHexString(), userId);
    expect(result.lastImmersionSession).toEqual(latest);
    expect(result.totalTimeSpent).toBe(180);
  });

  it.each([undefined, { unit: "page", start: 1, end: 10 }] as const)(
    "falls back to descending session ID when date and progress are equal: %j",
    async (progress) => {
      const content = await seedContent();
      const ids = [new Types.ObjectId(), new Types.ObjectId()].sort((a, b) =>
        a.toHexString().localeCompare(b.toHexString()),
      );
      const latest = await seedSession(content._id, "2026-10-13", 120, {
        id: ids[1],
        progress,
      });
      await seedSession(content._id, "2026-10-13", 60, {
        id: ids[0],
        progress,
      });
      const result = await service.getById(content._id.toHexString(), userId);
      expect(result.lastImmersionSession).toEqual(latest);
      expect(result.totalTimeSpent).toBe(180);
    },
  );
});
