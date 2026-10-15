import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
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

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content"> & {
  content: Types.ObjectId;
};

describe("ImmersionSessionService update database integration", () => {
  let module: TestingModule | undefined;
  let service: ImmersionSessionService;
  let sessions: Model<StoredSession>;
  let contents: Model<StoredContent>;
  let languages: Model<Language>;
  let languageId: Types.ObjectId;
  let contentId: Types.ObjectId;
  let otherContentId: Types.ObjectId;
  const userId = `auth0|update-${randomUUID()}`;
  const otherUserId = `auth0|update-${randomUUID()}`;
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
      name: "Update session test language",
    });
    languageId = language._id;
    const content = await contents.create({
      title: "Update session test content",
      type: "book",
      language: languageId,
      user_id: userId,
      completed: false,
    });
    contentId = content._id;
    const otherContent = await contents.create({
      title: "Other user's update session test content",
      type: "book",
      language: languageId,
      user_id: otherUserId,
      completed: false,
    });
    otherContentId = otherContent._id;
  });

  afterEach(async () => {
    if (sessions) await sessions.deleteMany(owners);
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

  function seedSession(owner = userId) {
    return sessions.create({
      content: owner === otherUserId ? otherContentId : contentId,
      duration: 1200,
      created_at: new Date("2024-02-28T00:00:00.000Z"),
      progress: { unit: "episode", start: 2, end: 4 },
      user_id: owner,
    });
  }

  it.each([
    { created_at: "2024-02-29" },
    { duration: 1 },
    { duration: 1800 },
    { created_at: "2024-02-29", duration: 1800 },
  ])(
    "persists a partial update and preserves omitted fields: %j",
    async (input) => {
      const target = await seedSession();
      const before = await sessions.findById(target._id).lean().exec();
      expect(before).not.toBeNull();

      await service.update(target._id.toHexString(), input, userId);

      const expected = {
        ...before,
        ...input,
        created_at:
          input.created_at === undefined
            ? before!.created_at
            : new Date(`${input.created_at}T00:00:00.000Z`),
      };
      const stored = await sessions.findById(target._id).lean().exec();
      // Mongoose may increment its version key when updating a document.
      expect(stored).toMatchObject(expectedWithoutVersion(expected));
      expect(await sessions.countDocuments(owners)).toBe(1);
    },
  );

  it("updates only the requested session and preserves linked content", async () => {
    const target = await seedSession();
    await seedSession();
    await seedSession(otherUserId);
    const unaffected = { ...owners, _id: { $ne: target._id } };
    const sessionsBefore = await sessions
      .find(unaffected)
      .sort({ _id: 1 })
      .lean()
      .exec();
    const contentsBefore = await contents
      .find(owners)
      .sort({ _id: 1 })
      .lean()
      .exec();

    await service.update(target._id.toHexString(), { duration: 1800 }, userId);

    expect((await sessions.findById(target._id).lean().exec())?.duration).toBe(
      1800,
    );
    expect(
      await sessions.find(unaffected).sort({ _id: 1 }).lean().exec(),
    ).toEqual(sessionsBefore);
    expect(await contents.find(owners).sort({ _id: 1 }).lean().exec()).toEqual(
      contentsBefore,
    );
    expect(await sessions.countDocuments(owners)).toBe(3);
  });

  describe.each(["episode", "page"] as const)("%s progress", (unit) => {
    it.each([
      { start: 1, end: 1 },
      { start: 1, end: 3 },
    ])(
      "persists both bounds and preserves the unit and other fields: %j",
      async (progress) => {
        const target = await sessions.create({
          content: contentId,
          user_id: userId,
          duration: 1200,
          created_at: new Date("2024-02-28T00:00:00.000Z"),
          progress: { unit, start: 2, end: 4 },
        });
        const before = await sessions.findById(target._id).lean().exec();

        await service.update(target._id.toHexString(), { progress }, userId);

        expect(await sessions.findById(target._id).lean().exec()).toMatchObject(
          expectedWithoutVersion({
            ...before!,
            progress: { unit, ...progress },
          }),
        );
      },
    );
  });

  it("persists date, duration, and progress together on the same session", async () => {
    const target = await seedSession();
    const input = {
      created_at: "2024-02-29",
      duration: 1800,
      progress: { start: 1, end: 3 },
    };

    await service.update(target._id.toHexString(), input, userId);

    expect(await sessions.findById(target._id).lean().exec()).toMatchObject({
      _id: target._id,
      content: contentId,
      user_id: userId,
      created_at: new Date("2024-02-29T00:00:00.000Z"),
      duration: 1800,
      progress: { unit: "episode", start: 1, end: 3 },
    });
    expect(await sessions.countDocuments(owners)).toBe(1);
  });

  it("leaves omitted progress absent when updating a session without progress", async () => {
    const target = await sessions.create({
      content: contentId,
      user_id: userId,
      duration: 1200,
      created_at: new Date("2024-02-28T00:00:00.000Z"),
    });

    await service.update(target._id.toHexString(), { duration: 1800 }, userId);

    const stored = await sessions.findById(target._id).lean().exec();
    expect(stored?.duration).toBe(1800);
    expect(stored?.progress).toBeUndefined();
    expect(stored?.created_at).toEqual(target.created_at);
    expect(stored?.content).toEqual(contentId);
    expect(stored?.user_id).toBe(userId);
  });

  it.each([
    { created_at: "2024-02-29" },
    { duration: 1800 },
    { progress: { start: 1, end: 3 } },
  ])(
    "rejects updating another user's session and preserves it in MongoDB: %j",
    async (input) => {
      const target = await seedSession(otherUserId);
      const before = await sessions.findById(target._id).lean().exec();

      await expect(
        service.update(target._id.toHexString(), input, userId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(await sessions.findById(target._id).lean().exec()).toEqual(before);
      expect(await sessions.countDocuments(owners)).toBe(1);
    },
  );

  it("returns not found for a missing session without inserting or changing records", async () => {
    await seedSession();
    await seedSession(otherUserId);
    const before = await sessions.find(owners).sort({ _id: 1 }).lean().exec();
    const missingId = new Types.ObjectId();
    expect(await sessions.exists({ _id: missingId })).toBeNull();

    await expect(
      service.update(missingId.toHexString(), { duration: 1800 }, userId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await sessions.find(owners).sort({ _id: 1 }).lean().exec()).toEqual(
      before,
    );
  });

  it("rejects setting progress bounds without an existing unit and saves none of the changes", async () => {
    const target = await sessions.create({
      content: contentId,
      user_id: userId,
      duration: 1200,
      created_at: new Date("2024-02-28T00:00:00.000Z"),
    });
    const before = await sessions.findById(target._id).lean().exec();

    await expect(
      service.update(
        target._id.toHexString(),
        {
          duration: 1800,
          progress: { start: 1, end: 3 },
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await sessions.findById(target._id).lean().exec()).toEqual(before);
  });

  it.each(["episode", "page"] as const)(
    "adds %s progress to a session without prior progress",
    async (unit) => {
      const target = await sessions.create({
        content: contentId,
        user_id: userId,
        duration: 1200,
        created_at: new Date("2024-02-28T00:00:00.000Z"),
      });
      const before = await sessions.findById(target._id).lean().exec();
      const input = { progress: { unit, start: 1, end: 3 } };

      const updated = await service.update(
        target._id.toHexString(),
        input,
        userId,
      );

      expect(updated.progress).toMatchObject(input.progress);
      expect(await sessions.findById(target._id).lean().exec()).toMatchObject(
        expectedWithoutVersion({ ...before!, progress: input.progress }),
      );
      expect(await sessions.countDocuments(owners)).toBe(1);
    },
  );

  it("does not change session ownership or content from additional input fields", async () => {
    const target = await seedSession();
    const input = {
      duration: 1800,
      user_id: otherUserId,
      content: otherContentId.toHexString(),
    };

    await service.update(target._id.toHexString(), input, userId);

    const stored = await sessions.findById(target._id).lean().exec();
    expect(stored?.duration).toBe(1800);
    expect(stored?.user_id).toBe(userId);
    expect(stored?.content).toEqual(contentId);
  });
});

function expectedWithoutVersion<T extends { __v?: unknown }>(value: T) {
  const { __v: _version, ...fields } = value;
  return fields;
}
