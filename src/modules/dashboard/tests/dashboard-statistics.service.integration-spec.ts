import "reflect-metadata";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Model, Types } from "mongoose";
import { randomUUID } from "node:crypto";
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

// Seconds throughout; UTC dates; weeks start on Monday.
// Week/month are current calendar periods; year is the trailing calendar year.
// Averages use elapsed calendar days (including today and days with no sessions).
// The current streak uses all session history for the selected language and may
// end yesterday.
describe("DashboardService statistics database integration", () => {
  let module: TestingModule | undefined;
  let service: DashboardService;
  let contents: Model<StoredContent>;
  let sessions: Model<StoredSession>;
  let languages: Model<Language>;
  const languageId = new Types.ObjectId();
  const otherLanguageId = new Types.ObjectId();
  const userId = `auth0|dashboard-${randomUUID()}`;
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

  async function session(
    entry: {
      _id: Types.ObjectId;
      language: Types.ObjectId;
      type: Content["type"];
    },
    date: string,
    duration = 60,
    owner = userId,
  ) {
    return sessions.create({
      content: entry._id,
      language: entry.language,
      content_type: entry.type,
      user_id: owner,
      created_at: new Date(`${date}T00:00:00.000Z`),
      duration,
    });
  }

  function bucket(start_date: string, reading_time = 0, audiovisual_time = 0) {
    return { start_date, reading_time, audiovisual_time };
  }

  it("uses session language and type instead of referenced content metadata", async () => {
    const entry = await content("anime", otherLanguageId);
    await sessions.create({
      content: entry._id,
      language: languageId,
      content_type: "book",
      user_id: userId,
      duration: 120,
      created_at: new Date("2026-10-15T00:00:00.000Z"),
    });
    expect(await statistics()).toMatchObject({
      reading_time: 120,
      audiovisual_time: 0,
    });
  });

  it("returns zeros and no yearly buckets when there has never been immersion", async () => {
    expect(await statistics()).toEqual({
      total_immersion_time: 0,
      current_streak: 0,
      reading_time: 0,
      audiovisual_time: 0,
      average_time: 0,
      breakdown: [],
    });
  });

  it("sums repeated sessions in seconds and groups book/manga versus anime/drama/video", async () => {
    for (const [type, duration] of [
      ["book", 101],
      ["manga", 202],
      ["anime", 303],
      ["drama", 404],
      ["video", 505],
    ] as const) {
      await session(await content(type), "2026-10-15", duration);
    }
    const book = await content();
    await session(book, "2026-10-15", 60);
    await session(book, "2026-10-15", 120);
    expect(await statistics()).toEqual({
      total_immersion_time: 1695,
      current_streak: 1,
      reading_time: 483,
      audiovisual_time: 1212,
      average_time: 1695,
      breakdown: [bucket("2026-01-01", 483, 1212)],
    });
  });

  it("scopes totals, streak, averages, and chart to both session owner and content language", async () => {
    const book = await content();
    await session(book, "2026-10-15", 100);
    await session(book, "2026-10-14", 900, otherUserId);
    await session(await content("anime", otherLanguageId), "2026-10-14", 800);
    await session(
      await content("video", languageId, otherUserId),
      "2026-10-13",
      700,
      otherUserId,
    );
    expect(await statistics()).toEqual({
      total_immersion_time: 100,
      current_streak: 1,
      reading_time: 100,
      audiovisual_time: 0,
      average_time: 100,
      breakdown: [bucket("2026-01-01", 100)],
    });
    expect(
      (await statistics("total", otherLanguageId)).total_immersion_time,
    ).toBe(800);
    expect(
      (await statistics("total", languageId, otherUserId)).total_immersion_time,
    ).toBe(1600);
  });

  it.each([
    ["week", "2026-10-12", "2026-10-11"],
    ["month", "2026-10-01", "2026-09-30"],
    ["year", "2025-10-15", "2025-10-14"],
  ] as const)(
    "%s includes its UTC start day and today, excluding older and future sessions",
    async (range, start, before) => {
      const book = await content();
      await session(book, before, 1000);
      await session(book, start, 60);
      await session(book, "2026-10-15", 120);
      await session(book, "2026-10-16", 2000);
      const result = await statistics(range);
      expect(result.total_immersion_time).toBe(180);
      expect(result.reading_time).toBe(180);
      expect(result.audiovisual_time).toBe(0);
      expect(
        result.breakdown.reduce(
          (sum, item) => sum + item.reading_time + item.audiovisual_time,
          0,
        ),
      ).toBe(180);
    },
  );

  it("returns Monday through Sunday buckets including empty and future days, averaging elapsed days", async () => {
    const book = await content();
    const anime = await content("anime");
    await session(book, "2026-10-12", 120);
    await session(book, "2026-10-15", 60);
    await session(anime, "2026-10-15", 240);
    expect(await statistics("week")).toEqual({
      total_immersion_time: 420,
      current_streak: 1,
      reading_time: 180,
      audiovisual_time: 240,
      average_time: 105, // 420 / 4 elapsed days, including the empty Tuesday/Wednesday
      breakdown: [
        bucket("2026-10-12", 120),
        bucket("2026-10-13"),
        bucket("2026-10-14"),
        bucket("2026-10-15", 60, 240),
        bucket("2026-10-16"),
        bucket("2026-10-17"),
        bucket("2026-10-18"),
      ],
    });
  });

  it("groups the current month into Monday-start weeks clipped to the month", async () => {
    const book = await content();
    const video = await content("video");
    await session(book, "2026-09-30", 900);
    await session(book, "2026-10-01", 150);
    await session(video, "2026-10-04", 300);
    await session(book, "2026-10-05", 450);
    await session(video, "2026-10-12", 600);
    const result = await statistics("month");
    expect(result.total_immersion_time).toBe(1500);
    expect(result.average_time).toBe(100); // 15 elapsed days
    expect(result.breakdown).toEqual([
      bucket("2026-10-01", 150, 300),
      bucket("2026-10-05", 450),
      bucket("2026-10-12", 0, 600),
      bucket("2026-10-19"),
      bucket("2026-10-26"),
    ]);
  });

  it("groups the trailing year by calendar month with partial boundary months and zero-filled gaps", async () => {
    const book = await content();
    const anime = await content("anime");
    await session(book, "2025-10-14", 9999);
    await session(book, "2025-10-15", 120);
    await session(anime, "2025-12-31", 180);
    await session(book, "2026-01-01", 240);
    await session(anime, "2026-10-15", 192);
    const result = await statistics("year");
    expect(result.total_immersion_time).toBe(732);
    expect(result.average_time).toBe(2); // 366 inclusive UTC days
    expect(result.breakdown).toEqual([
      bucket("2025-10-15", 120),
      bucket("2025-11-01"),
      bucket("2025-12-01", 0, 180),
      bucket("2026-01-01", 240),
      bucket("2026-02-01"),
      bucket("2026-03-01"),
      bucket("2026-04-01"),
      bucket("2026-05-01"),
      bucket("2026-06-01"),
      bucket("2026-07-01"),
      bucket("2026-08-01"),
      bucket("2026-09-01"),
      bucket("2026-10-01", 0, 192),
    ]);
  });

  it("includes all six partial or full weeks when a month starts on Sunday", async () => {
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
    const book = await content();
    await session(book, "2026-03-01", 31);
    await session(book, "2026-03-31", 62);
    const result = await statistics("month");
    expect(result.total_immersion_time).toBe(93);
    expect(result.average_time).toBe(3);
    expect(result.breakdown).toEqual([
      bucket("2026-03-01", 31),
      bucket("2026-03-02"),
      bucket("2026-03-09"),
      bucket("2026-03-16"),
      bucket("2026-03-23"),
      bucket("2026-03-30", 62),
    ]);
  });

  it("counts the leap day in the daily average for a trailing year", async () => {
    vi.setSystemTime(new Date("2024-03-01T12:00:00.000Z"));
    const book = await content();
    await session(book, "2023-03-01", 100);
    await session(book, "2024-02-29", 267);
    const result = await statistics("year");
    expect(result.total_immersion_time).toBe(367);
    expect(result.current_streak).toBe(1);
    expect(result.average_time).toBe(1);
    expect(result.breakdown).toContainEqual(bucket("2024-02-01", 267));
  });

  it.each([
    ["week", 7],
    ["month", 5],
    ["year", 13],
  ] as const)(
    "zero-fills %s chart buckets when the selected language has no sessions",
    async (range, count) => {
      await session(await content("book", otherLanguageId), "2026-10-15");
      const result = await statistics(range);
      expect(result).toEqual({
        total_immersion_time: 0,
        current_streak: 0,
        reading_time: 0,
        audiovisual_time: 0,
        average_time: 0,
        breakdown: expect.any(Array),
      });
      expect(result.breakdown).toHaveLength(count);
      for (const item of result.breakdown) {
        expect(item.reading_time).toBe(0);
        expect(item.audiovisual_time).toBe(0);
      }
    },
  );

  it("groups all-time immersion by ascending year, retaining empty intervening years", async () => {
    const book = await content();
    const anime = await content("anime");
    await session(book, "2023-12-31", 100);
    await session(anime, "2025-01-01", 200);
    await session(book, "2026-10-15", 300);
    await session(book, "2026-10-16", 999);
    const result = await statistics();
    expect(result.total_immersion_time).toBe(600);
    expect(result.average_time).toBeCloseTo(600 / 1020, 10);
    expect(result.breakdown).toEqual([
      bucket("2023-01-01", 100),
      bucket("2024-01-01"),
      bucket("2025-01-01", 0, 200),
      bucket("2026-01-01", 300),
    ]);
  });

  it.each([
    [["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-15"], 3],
    [["2026-10-12", "2026-10-13", "2026-10-14"], 3],
    [["2026-10-10", "2026-10-11", "2026-10-13"], 0],
    [["2026-10-12", "2026-10-14", "2026-10-15"], 2],
  ])(
    "counts consecutive distinct UTC session days %j as streak %i",
    async (dates, streak) => {
      const book = await content();
      for (const date of dates) await session(book, date);
      expect((await statistics()).current_streak).toBe(streak);
    },
  );

  it("keeps the full current streak when the selected range starts later", async () => {
    const book = await content();
    for (let day = 10; day <= 15; day++) await session(book, `2026-10-${day}`);
    expect((await statistics("week")).current_streak).toBe(6);
    expect((await statistics("month")).current_streak).toBe(6);
  });

  it("uses UTC even when the server's current local date differs", async () => {
    vi.setSystemTime(new Date("2026-10-16T00:30:00+09:00")); // October 15 UTC
    await session(await content(), "2026-10-15", 120);
    expect((await statistics("week")).current_streak).toBe(1);
    expect((await statistics("week")).average_time).toBe(30);
  });
});
