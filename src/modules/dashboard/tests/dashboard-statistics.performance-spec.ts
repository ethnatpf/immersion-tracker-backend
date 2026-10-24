import "reflect-metadata";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Model, Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { DashboardModule } from "../dashboard.module.js";
import { DashboardService } from "../dashboard.service.js";
import {
  Content,
  ContentSchema,
} from "../../content/schemas/content.schema.js";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "../../immersion-session/schemas/immersion-session.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";

type Range = "total" | "year" | "month" | "week";
type Statistics = {
  total_immersion_time: number;
  current_streak: number;
  reading_time: number;
  audiovisual_time: number;
  average_time: number;
  breakdown: {
    start_date: string;
    reading_time: number;
    audiovisual_time: number;
  }[];
};
type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content" | "language"> & {
  content: Types.ObjectId;
  language: Types.ObjectId;
};

// Query and calculation latency only; seed writes and index setup are excluded.
describe("DashboardService statistics performance", () => {
  let module: TestingModule | undefined;
  let service: DashboardService;
  let contents: Model<StoredContent>;
  let sessions: Model<StoredSession>;
  let languages: Model<Language>;
  const languageId = new Types.ObjectId();
  const otherLanguageId = new Types.ObjectId();
  const userId = `auth0|dashboard-performance-${randomUUID()}`;
  const otherUserId = `auth0|dashboard-${randomUUID()}`;
  const owners = { user_id: { $in: [userId, otherUserId] } };
  const now = new Date("2026-10-15T12:00:00.000Z"); // Thursday

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
          { name: ImmersionSession.name, schema: ImmersionSessionSchema },
          { name: Language.name, schema: LanguageSchema },
        ]),
        DashboardModule,
      ],
    }).compile();
    service = module.get(DashboardService);
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    sessions = module.get<Model<StoredSession>>(
      getModelToken(ImmersionSession.name),
    );
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    await Promise.all([contents.init(), sessions.init()]);
    await languages.insertMany([
      {
        _id: languageId,
        code: `test-${randomUUID()}`,
        name: "Dashboard language",
        nativeName: "Dashboard language",
      },
      {
        _id: otherLanguageId,
        code: `test-${randomUUID()}`,
        name: "Other language",
        nativeName: "Other language",
      },
    ]);
  });

  beforeEach(() => {
    // Keep database timers and the performance clock real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (sessions) await sessions.deleteMany(owners);
    if (contents) await contents.deleteMany(owners);
  });

  afterAll(async () => {
    try {
      if (sessions) await sessions.deleteMany(owners);
      if (contents) await contents.deleteMany(owners);
      if (languages)
        await languages.deleteMany({
          _id: { $in: [languageId, otherLanguageId] },
        });
    } finally {
      await module?.close();
    }
  });

  function statistics(
    range: Range = "total",
    language = languageId,
    owner = userId,
  ): Promise<Statistics> {
    return service.statistics(
      { range, language: language.toHexString() },
      owner,
    );
  }

  async function content(
    type: Content["type"] = "book",
    language = languageId,
    owner = userId,
  ) {
    return contents.create({
      title: `Dashboard ${randomUUID()}`,
      type,
      language,
      user_id: owner,
      completed: false,
    });
  }

  it.each([
    ["total", 1750],
    ["year", 1000],
    ["month", 750],
    ["week", 500],
  ] as const)(
    "computes %s statistics over 5,000 persisted sessions in less than %i ms",
    async (range, limitMs) => {
      const book = await content();
      const anime = await content("anime");
      // Five sessions per UTC day across 1,000 days, ending today.
      const records = Array.from({ length: 5000 }, (_, index) => ({
        user_id: userId,
        content: index % 2 === 0 ? book._id : anime._id,
        language: languageId,
        content_type: index % 2 === 0 ? book.type : anime.type,
        duration: 60,
        created_at: new Date(Date.UTC(2026, 9, 15 - Math.floor(index / 5))),
      }));
      await sessions.insertMany(records);
      expect(await sessions.countDocuments({ user_id: userId })).toBe(5000);

      // No warm-up call; fixture writes, index setup and verification are untimed.
      const started = performance.now();
      const result = await statistics(range);
      const elapsedMs = performance.now() - started;

      const days = { total: 1000, year: 366, month: 15, week: 4 }[range];
      expect(result.total_immersion_time).toBe(days * 300);
      expect(result.current_streak).toBe(days);
      expect(result.average_time).toBe(300);
      expect(result.reading_time + result.audiovisual_time).toBe(days * 300);
      expect(
        result.breakdown.reduce(
          (sum, item) => sum + item.reading_time + item.audiovisual_time,
          0,
        ),
      ).toBe(days * 300);
      expect(
        elapsedMs,
        `${range} statistics took ${elapsedMs.toFixed(1)} ms`,
      ).toBeLessThan(limitMs);
    },
  );
});
