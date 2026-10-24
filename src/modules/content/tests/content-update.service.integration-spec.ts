import "reflect-metadata";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { type Model, Types } from "mongoose";
import { ContentModule } from "../content.module.js";
import { ContentService } from "../content.service.js";
import { Content } from "../schemas/content.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";

import { ImmersionSession } from "../../immersion-session/schemas/immersion-session.schema.js";
import { DashboardModule } from "../../dashboard/dashboard.module.js";
import { DashboardService } from "../../dashboard/dashboard.service.js";
import { UserModule } from "../../user/user.module.js";
import { UserService } from "../../user/user.service.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };

describe("ContentService update database integration", () => {
  let module: TestingModule | undefined;
  let service: ContentService;
  let contents: Model<StoredContent>;
  let sessions: Model<
    Omit<ImmersionSession, "content"> & { content: Types.ObjectId }
  >;
  let languages: Model<Language>;
  let languageId: Types.ObjectId;
  let otherLanguageId: Types.ObjectId;
  const userId = `auth0|content-update-${randomUUID()}`;
  const otherUserId = `auth0|content-update-${randomUUID()}`;
  const owners = { user_id: { $in: [userId, otherUserId] } };
  const languageIds: Types.ObjectId[] = [];

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
          { name: Language.name, schema: LanguageSchema },
        ]),
        ContentModule,
        DashboardModule,
        UserModule,
      ],
    }).compile();
    service = module.get(ContentService);
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    sessions = module.get(getModelToken(ImmersionSession.name));
    await Promise.all([contents.init(), sessions.init()]);
    for (const name of ["Original language", "Updated language"]) {
      const language = await languages.create({
        code: `test-${randomUUID()}`,
        name,
        nativeName: name,
      });
      languageIds.push(language._id);
    }
    [languageId, otherLanguageId] = languageIds as [
      Types.ObjectId,
      Types.ObjectId,
    ];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (sessions) await sessions.deleteMany(owners);
    if (contents) await contents.deleteMany(owners);
  });

  afterAll(async () => {
    try {
      vi.restoreAllMocks();
      if (sessions) await sessions.deleteMany(owners);
      if (contents) await contents.deleteMany(owners);
      if (languages && languageIds.length)
        await languages.deleteMany({ _id: { $in: languageIds } });
    } finally {
      await module?.close();
    }
  });

  function seedContent(
    title = "The Forest Chronicles",
    owner = userId,
    completed = false,
    type: Content["type"] = "book",
  ) {
    return contents.create({
      title,
      type,
      user_id: owner,
      completed,
      language: languageId,
      url: "https://example.com/content",
    });
  }

  async function seedSession(
    entry: { _id: Types.ObjectId; type: Content["type"] },
    owner = userId,
  ) {
    return sessions.create({
      content: entry._id,
      language: languageId,
      content_type: entry.type,
      user_id: owner,
      duration: 60,
      created_at: new Date("2020-01-01T00:00:00.000Z"),
    });
  }

  it("synchronizes only owned sessions for edited content and moves statistics", async () => {
    const target = await seedContent();
    const first = await seedSession(target);
    const second = await seedSession(target);
    const unrelated = await seedSession(await seedContent("Unrelated"));
    const foreign = await seedSession(target, otherUserId);
    const unchanged = await sessions
      .find({ _id: { $in: [unrelated._id, foreign._id] } })
      .lean()
      .exec();
    await service.update(
      target._id.toHexString(),
      { language: otherLanguageId.toHexString() },
      userId,
    );
    for (const id of [first._id, second._id]) {
      expect(await sessions.findById(id).lean().exec()).toMatchObject({
        language: otherLanguageId,
        content_type: "book",
        duration: 60,
      });
    }
    expect(
      await sessions
        .find({ _id: { $in: [unrelated._id, foreign._id] } })
        .lean()
        .exec(),
    ).toEqual(unchanged);
    expect(await module!.get(UserService).preferences(userId)).toEqual({
      preferred_language: otherLanguageId.toHexString(),
    });
    for (const [language, total] of [
      [languageId, 60],
      [otherLanguageId, 120],
    ] as const) {
      expect(
        await module!
          .get(DashboardService)
          .statistics(
            { range: "total", language: language.toHexString() },
            userId,
          ),
      ).toMatchObject({ total_immersion_time: total });
    }
  });

  it("rolls back content and session language when synchronization fails after writing", async () => {
    const target = await seedContent();
    await seedSession(target);
    const before = await sessions.find(owners).lean().exec();
    const updateMany = sessions.collection.updateMany.bind(sessions.collection);
    vi.spyOn(sessions.collection, "updateMany").mockImplementation(
      async (...args) => {
        await updateMany(...args);
        throw new Error("Injected synchronization failure");
      },
    );
    await expect(
      service.update(
        target._id.toHexString(),
        { language: otherLanguageId.toHexString() },
        userId,
      ),
    ).rejects.toThrow("Injected synchronization failure");
    expect(
      (await contents.findById(target._id).lean().exec())?.language,
    ).toEqual(languageId);
    expect(await sessions.find(owners).lean().exec()).toEqual(before);
  });

  it.each([
    "invalid language",
    "inaccessible",
    "duplicate title",
    "ordinary edit",
  ])("preserves session metadata for %s", async (kind) => {
    const target = await seedContent();
    await seedSession(target);
    await seedContent("Existing title");
    const before = await sessions.find(owners).lean().exec();
    const input =
      kind === "ordinary edit"
        ? { title: "New title", completed: true }
        : {
            language:
              kind === "invalid language"
                ? new Types.ObjectId().toHexString()
                : otherLanguageId.toHexString(),
            ...(kind === "duplicate title" ? { title: "Existing title" } : {}),
          };
    const result = service.update(
      target._id.toHexString(),
      input,
      kind === "inaccessible" ? otherUserId : userId,
    );
    if (kind === "ordinary edit") await result;
    else await expect(result).rejects.toThrow();
    expect(await sessions.find(owners).lean().exec()).toEqual(before);
  });

  it.each([
    { title: "Updated title" },
    { completed: true },
    { title: "Updated title", completed: true },
  ])(
    "persists a partial update and preserves omitted fields: %j",
    async (input) => {
      const target = await seedContent();
      const before = target.toObject();

      const updated = await service.update(
        target._id.toHexString(),
        input,
        userId,
      );

      const { __v: _version, ...expected } = { ...before, ...input };
      expect(updated).toMatchObject(expected);
      expect(await contents.findById(target._id).lean().exec()).toMatchObject(
        expected,
      );
      expect(await contents.countDocuments(owners)).toBe(1);
    },
  );

  it("allows completed content to be marked incomplete again", async () => {
    const target = await seedContent("Completed book", userId, true);

    const updated = await service.update(
      target._id.toHexString(),
      { completed: false },
      userId,
    );

    expect(updated.completed).toBe(false);
    expect(await contents.findById(target._id).lean().exec()).toMatchObject({
      title: target.title,
      completed: false,
      user_id: userId,
      language: languageId,
    });
  });

  it.each([false, true])(
    "changes language with other fields included: %s",
    async (includeOtherFields) => {
      const target = await seedContent();
      const input = {
        language: otherLanguageId.toHexString(),
        ...(includeOtherFields
          ? { title: "Updated title", completed: true }
          : {}),
      };
      const { __v: _version, ...expected } = {
        ...target.toObject(),
        ...input,
        language: otherLanguageId,
      };

      const updated = await service.update(
        target._id.toHexString(),
        input,
        userId,
      );

      expect(updated).toMatchObject(expected);
      expect(await contents.findById(target._id).lean().exec()).toMatchObject(
        expected,
      );
    },
  );

  it("updates only the requested content", async () => {
    const target = await seedContent();
    await seedContent("Another owned book");
    await seedContent(target.title, otherUserId);
    const unaffected = { ...owners, _id: { $ne: target._id } };
    const before = await contents
      .find(unaffected)
      .sort({ _id: 1 })
      .lean()
      .exec();

    await service.update(target._id.toHexString(), { completed: true }, userId);

    expect((await contents.findById(target._id).lean().exec())?.completed).toBe(
      true,
    );
    expect(
      await contents.find(unaffected).sort({ _id: 1 }).lean().exec(),
    ).toEqual(before);
    expect(await contents.countDocuments(owners)).toBe(3);
  });

  it.each(["title", "completed", "language", "all"])(
    "rejects updating another user's content and leaves it unchanged: %s",
    async (field) => {
      const target = await seedContent("Private book", otherUserId);
      const before = target.toObject();
      const all = {
        title: "Stolen book",
        completed: true,
        language: otherLanguageId.toHexString(),
      };
      const input =
        field === "all" ? all : { [field]: all[field as keyof typeof all] };

      await expect(
        service.update(target._id.toHexString(), input, userId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(await contents.findById(target._id).lean().exec()).toEqual(before);
      expect(await contents.countDocuments(owners)).toBe(1);
    },
  );

  it("returns not found for a missing ID without inserting or changing content", async () => {
    await seedContent();
    await seedContent("Private book", otherUserId);
    const before = await contents.find(owners).sort({ _id: 1 }).lean().exec();

    await expect(
      service.update(
        new Types.ObjectId().toHexString(),
        { completed: true },
        userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await contents.find(owners).sort({ _id: 1 }).lean().exec()).toEqual(
      before,
    );
  });

  it("rejects a nonexistent language and saves none of the supplied changes", async () => {
    const target = await seedContent();
    const before = target.toObject();

    await expect(
      service.update(
        target._id.toHexString(),
        {
          title: "Updated title",
          completed: true,
          language: new Types.ObjectId().toHexString(),
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await contents.findById(target._id).lean().exec()).toEqual(before);
  });

  it("does not change ownership, type, or URL from additional input fields", async () => {
    const target = await seedContent();
    const input = {
      title: "Updated title",
      user_id: otherUserId,
      type: "anime",
      url: "https://example.com/another-content",
    };

    await service.update(target._id.toHexString(), input, userId);

    expect(await contents.findById(target._id).lean().exec()).toMatchObject({
      title: input.title,
      user_id: userId,
      type: target.type,
      url: target.url,
    });
  });

  it("rejects a duplicate title and type for the same user without persisting changes", async () => {
    const target = await seedContent();
    await seedContent("Existing title");
    const before = await contents.find(owners).sort({ _id: 1 }).lean().exec();

    await expect(
      service.update(
        target._id.toHexString(),
        {
          title: "Existing title",
          completed: true,
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await contents.find(owners).sort({ _id: 1 }).lean().exec()).toEqual(
      before,
    );
  });

  it("allows a title used by another user or by another content type", async () => {
    const target = await seedContent();
    await seedContent("Shared title", otherUserId);
    await seedContent("Shared title", userId, false, "anime");

    await service.update(
      target._id.toHexString(),
      { title: "Shared title" },
      userId,
    );

    expect(await contents.findById(target._id).lean().exec()).toMatchObject({
      title: "Shared title",
      type: "book",
      user_id: userId,
    });
    expect(await contents.countDocuments(owners)).toBe(3);
  });
});
