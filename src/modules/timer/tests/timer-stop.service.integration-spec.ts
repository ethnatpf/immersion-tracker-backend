import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { type Model, Types } from "mongoose";
import {
  Content,
  ContentSchema,
} from "../../content/schemas/content.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "../../immersion-session/schemas/immersion-session.schema.js";
import { TimerModule } from "../timer.module.js";
import { TimerService } from "../timer.service.js";
import { Timer } from "../schemas/timer.schema.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredTimer = Omit<Timer, "content"> & { content: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content" | "language"> & {
  content: Types.ObjectId;
  language: Types.ObjectId;
};

describe("TimerService stop database integration", () => {
  let module: TestingModule | undefined;
  let service: TimerService;
  let timers: Model<StoredTimer>;
  let sessions: Model<StoredSession>;
  let contents: Model<StoredContent>;
  let languages: Model<Language>;
  let languageId: Types.ObjectId;
  let contentId: Types.ObjectId;
  let otherContentId: Types.ObjectId;
  const userId = `auth0|stop-timer-${randomUUID()}`;
  const otherUserId = `auth0|stop-timer-${randomUUID()}`;
  const owners = { user_id: { $in: [userId, otherUserId] } };
  const startedAt = new Date("2026-10-15T12:00:00.000Z");
  const stoppedAt = new Date("2026-10-15T12:20:00.000Z");

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
          { name: ImmersionSession.name, schema: ImmersionSessionSchema },
        ]),
        TimerModule,
      ],
    }).compile();
    service = module.get(TimerService);
    timers = module.get<Model<StoredTimer>>(getModelToken(Timer.name));
    sessions = module.get<Model<StoredSession>>(
      getModelToken(ImmersionSession.name),
    );
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    await Promise.all([timers.init(), sessions.init(), contents.init()]);
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Stop timer test language",
      nativeName: "Stop timer test language",
    });
    languageId = language._id;
    const content = await contents.create({
      title: "Stop timer content",
      type: "book",
      user_id: userId,
      language: languageId,
      completed: false,
    });
    contentId = content._id;
    const otherContent = await contents.create({
      title: "Other user's stop timer content",
      type: "anime",
      user_id: otherUserId,
      language: languageId,
      completed: false,
    });
    otherContentId = otherContent._id;
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(stoppedAt);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (timers) await timers.deleteMany(owners);
    if (sessions) await sessions.deleteMany(owners);
  });

  afterAll(async () => {
    try {
      if (timers) await timers.deleteMany(owners);
      if (sessions) await sessions.deleteMany(owners);
      if (contents) await contents.deleteMany(owners);
      if (languages && languageId)
        await languages.deleteOne({ _id: languageId });
    } finally {
      await module?.close();
    }
  });

  function seedTimer(owner = userId) {
    return timers.create({
      user_id: owner,
      content: owner === otherUserId ? otherContentId : contentId,
      started_at: startedAt,
    });
  }

  it("copies current content metadata when stopping a running timer", async () => {
    await seedTimer();
    const changedLanguage = new Types.ObjectId();
    await contents.updateOne(
      { _id: contentId },
      { $set: { language: changedLanguage } },
    );
    try {
      const created = await service.stop(userId);
      expect(await sessions.findById(created._id).lean().exec()).toMatchObject({
        language: changedLanguage,
        content_type: "book",
      });
    } finally {
      await contents.updateOne(
        { _id: contentId },
        { $set: { language: languageId } },
      );
    }
  });

  it.each(["missing", "inaccessible"])(
    "preserves the timer when content is %s",
    async (kind) => {
      const timer = await seedTimer();
      await timers.updateOne(
        { _id: timer._id },
        {
          $set: {
            content: kind === "missing" ? new Types.ObjectId() : otherContentId,
          },
        },
      );
      const before = await timers.findById(timer._id).lean().exec();
      await expect(service.stop(userId)).rejects.toThrow(
        "Content does not exist",
      );
      expect(await timers.findById(timer._id).lean().exec()).toEqual(before);
      expect(await sessions.countDocuments(owners)).toBe(0);
    },
  );

  it("deletes the active timer and persists a session with its content, owner, and elapsed seconds", async () => {
    const timer = await seedTimer();
    const contentBefore = await contents.findById(contentId).lean().exec();
    const created = await service.stop(userId);
    const stored = await sessions.findById(created._id).lean().exec();
    expect(stored).toMatchObject({ user_id: userId, duration: 1200 });
    expect(stored?.content.toString()).toBe(contentId.toString());
    expect(stored?.created_at.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(await sessions.countDocuments(owners)).toBe(1);
    expect(await timers.findById(timer._id).lean().exec()).toBeNull();
    expect(await contents.findById(contentId).lean().exec()).toEqual(
      contentBefore,
    );
  });

  it("returns not found without creating a session when no timer is active", async () => {
    await expect(service.stop(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await sessions.countDocuments(owners)).toBe(0);
    expect(await timers.countDocuments(owners)).toBe(0);
  });

  it("cannot stop another user's timer when the caller has none", async () => {
    const other = await seedTimer(otherUserId);
    const before = await timers.findById(other._id).lean().exec();
    await expect(service.stop(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await timers.findById(other._id).lean().exec()).toEqual(before);
    expect(await sessions.countDocuments(owners)).toBe(0);
    await service.stop(otherUserId);
    expect(await timers.findById(other._id).lean().exec()).toBeNull();
    expect(await sessions.countDocuments({ user_id: otherUserId })).toBe(1);
  });

  it("stops only the caller's timer and preserves other timers and existing sessions", async () => {
    const own = await seedTimer();
    const other = await seedTimer(otherUserId);
    const otherBefore = await timers.findById(other._id).lean().exec();
    const existing = await sessions.create({
      language: languageId,
      content_type: "book",
      user_id: userId,
      content: contentId,
      duration: 60,
    });
    const existingBefore = await sessions.findById(existing._id).lean().exec();
    await service.stop(userId);
    expect(await timers.findById(own._id).lean().exec()).toBeNull();
    expect(await timers.findById(other._id).lean().exec()).toEqual(otherBefore);
    expect(await sessions.findById(existing._id).lean().exec()).toEqual(
      existingBefore,
    );
    expect(await sessions.countDocuments({ user_id: userId })).toBe(2);
    expect(await sessions.countDocuments({ user_id: otherUserId })).toBe(0);
  });

  it("rejects a repeated stop without creating a duplicate session", async () => {
    await seedTimer();
    await service.stop(userId);
    await expect(service.stop(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await sessions.countDocuments(owners)).toBe(1);
  });

  it("creates exactly one session when two stop requests arrive simultaneously", async () => {
    await seedTimer();
    const results = await Promise.allSettled([
      service.stop(userId),
      service.stop(userId),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === "rejected");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBeInstanceOf(NotFoundException);
    expect(await sessions.countDocuments(owners)).toBe(1);
    expect(await timers.countDocuments(owners)).toBe(0);
  });

  it("rolls back both collections if session insertion fails after the write", async () => {
    const timer = await seedTimer();
    const before = await timers.findById(timer._id).lean().exec();
    const failure = new Error("Injected failure after session insert");
    const insertOne = sessions.collection.insertOne.bind(sessions.collection);
    const insert = vi
      .spyOn(sessions.collection, "insertOne")
      .mockImplementation(async (...args) => {
        await insertOne(...args);
        throw failure;
      });
    await expect(service.stop(userId)).rejects.toThrow(failure);
    expect(insert).toHaveBeenCalled();
    expect(await timers.findById(timer._id).lean().exec()).toEqual(before);
    expect(await sessions.countDocuments(owners)).toBe(0);
  });

  it("rolls back both collections if timer deletion fails after the write", async () => {
    const timer = await seedTimer();
    const before = await timers.findById(timer._id).lean().exec();
    const failure = new Error("Injected failure after timer delete");
    // Cover the usual deletion APIs while leaving the real MongoDB write intact.
    const deleteOne = timers.collection.deleteOne.bind(timers.collection);
    const findOneAndDelete = timers.collection.findOneAndDelete.bind(
      timers.collection,
    );
    const deletion = vi
      .spyOn(timers.collection, "deleteOne")
      .mockImplementation(async (...args) => {
        await deleteOne(...args);
        throw failure;
      });
    const findAndDelete = vi
      .spyOn(timers.collection, "findOneAndDelete")
      .mockImplementation(async (...args) => {
        await findOneAndDelete(...args);
        throw failure;
      });
    await expect(service.stop(userId)).rejects.toThrow(failure);
    expect(deletion.mock.calls.length + findAndDelete.mock.calls.length).toBe(
      1,
    );
    expect(await timers.findById(timer._id).lean().exec()).toEqual(before);
    expect(await sessions.countDocuments(owners)).toBe(0);
  });
});
