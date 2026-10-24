import "reflect-metadata";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import { Model, Types } from "mongoose";
import { ContentModule } from "../content.module.js";
import { ContentService } from "../content.service.js";
import { Content } from "../schemas/content.schema.js";
import { CreateContentDto } from "../dto/create-content.dto.js";
import type { SearchContentDto } from "../dto/search-content.dto.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";

describe("ContentService database integration", () => {
  let module: TestingModule | undefined;
  let service: ContentService;
  let contents: Model<Content>;
  let languages: Model<Language>;
  let input: CreateContentDto;
  let languageId: string;
  const userId = `content-integration-${randomUUID()}`;
  const otherUserId = `content-integration-${randomUUID()}`;
  const testOwners = { user_id: { $in: [userId, otherUserId] } };

  beforeAll(async () => {
    const uri = process.env.MONGODB_TEST_URL;
    if (!uri) {
      throw new Error("MONGODB_TEST_URL is required for integration tests");
    }

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
      ],
    }).compile();

    contents = module.get<Model<Content>>(getModelToken(Content.name));
    // Wait for index creation before testing database uniqueness.
    await contents.init();
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Integration test language",
      nativeName: "Integration test language",
    });
    languageId = language._id.toString();
    input = {
      title: "Integration test book",
      type: "book",
      language: languageId,
    };
  });

  beforeEach(() => {
    service = module!.get(ContentService);
  });

  afterEach(async () => {
    if (contents) await contents.deleteMany(testOwners);
  });

  afterAll(async () => {
    try {
      if (contents) await contents.deleteMany(testOwners);
      if (languages && languageId) {
        await languages.deleteOne({ _id: languageId });
      }
    } finally {
      await module?.close();
    }
  });

  describe("create", () => {
    it("persists content with its owner and language, initially incomplete", async () => {
      const created = await service.create(input, userId);

      expect(created._id).toBeDefined();
      const stored = await contents.findById(created._id).lean().exec();
      expect(stored).toMatchObject({
        title: input.title,
        type: input.type,
        user_id: userId,
        completed: false,
      });
      expect(stored?.language.toString()).toBe(languageId);
      expect(stored?.url).toBeUndefined();
      expect(await contents.countDocuments({ user_id: userId })).toBe(1);
    });

    it("persists the optional URL when supplied", async () => {
      const url = "https://example.com/books/123";
      const created = await service.create({ ...input, url }, userId);

      const stored = await contents.findById(created._id).lean().exec();
      expect(stored?.url).toBe(url);
      expect(await contents.countDocuments({ user_id: userId })).toBe(1);
    });

    it("rejects the same title and type for the same user without inserting a duplicate", async () => {
      const anime: CreateContentDto = {
        title: input.title,
        type: "anime",
        language: languageId,
      };
      const created = await service.create(anime, userId);

      await expect(service.create(anime, userId)).rejects.toThrow(
        new ConflictException(
          "You already have content with this title and type",
        ),
      );

      const stored = await contents.find({ user_id: userId }).lean().exec();
      expect(stored).toHaveLength(1);
      expect(stored[0]._id.toString()).toBe(created._id.toString());
    });

    it("allows the same title with different types for the same user", async () => {
      const anime = await service.create(
        { title: input.title, type: "anime", language: languageId },
        userId,
      );
      const manga = await service.create(
        { title: input.title, type: "manga", language: languageId },
        userId,
      );

      expect(anime._id.toString()).not.toBe(manga._id.toString());
      const stored = await contents
        .find({ user_id: userId, title: input.title })
        .lean()
        .exec();
      expect(stored).toHaveLength(2);
      expect(stored.map((content) => content.type).sort()).toEqual([
        "anime",
        "manga",
      ]);
    });

    it("allows different users to create separate content with the same title and type", async () => {
      const first = await service.create(input, userId);
      const second = await service.create(input, otherUserId);

      expect(first._id.toString()).not.toBe(second._id.toString());
      const stored = await contents.find(testOwners).lean().exec();
      expect(stored).toHaveLength(2);
      expect(stored).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: input.title,
            type: input.type,
            user_id: userId,
          }),
          expect.objectContaining({
            title: input.title,
            type: input.type,
            user_id: otherUserId,
          }),
        ]),
      );
    });

    it("rejects a nonexistent language without persisting content", async () => {
      const language = new Types.ObjectId().toHexString();
      expect(await languages.exists({ _id: language })).toBeNull();

      await expect(
        service.create(
          { title: input.title, type: input.type, language },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(await contents.countDocuments({ user_id: userId })).toBe(0);
    });
  });

  describe("search", () => {
    let secondLanguageId: string;

    beforeAll(async () => {
      const language = await languages.create({
        code: `test-${randomUUID()}`,
        name: "Second search test language",
        nativeName: "Second search test language",
      });
      secondLanguageId = language._id.toString();
    });

    afterAll(async () => {
      if (languages && secondLanguageId) {
        await languages.deleteOne({ _id: secondLanguageId });
      }
    });

    function search(query: SearchContentDto = {}) {
      return service.search(query, userId);
    }

    function seed(
      entries: {
        title: string;
        type?: Content["type"];
        language?: string;
        user_id?: string;
        completed?: boolean;
      }[],
    ) {
      return contents.insertMany(
        entries.map((entry) => ({
          type: "book",
          language: languageId,
          user_id: userId,
          completed: false,
          url: "https://example.com/content",
          ...entry,
        })),
      );
    }

    it("returns each content's persisted ID as a string alongside title and type", async () => {
      const stored = await seed([
        { title: "Forest", type: "manga" },
        { title: "Forest", type: "anime" },
      ]);

      expect(await search({ q: "forest" })).toEqual({
        items: [
          { id: stored[1]!._id.toHexString(), title: "Forest", type: "anime" },
          { id: stored[0]!._id.toHexString(), title: "Forest", type: "manga" },
        ],
        total: 2,
        page: 1,
        limit: 20,
      });
    });

    it("matches exact, prefix, and middle substrings without case sensitivity", async () => {
      await seed([
        { title: "The Forest Chronicles" },
        { title: "FOREST" },
        { title: "Forest adventures" },
        { title: "Ocean" },
      ]);
      expect(await search({ q: "fOrEsT" })).toEqual({
        items: [
          { id: expect.any(String), title: "FOREST", type: "book" },
          { id: expect.any(String), title: "Forest adventures", type: "book" },
          {
            id: expect.any(String),
            title: "The Forest Chronicles",
            type: "book",
          },
        ],
        total: 3,
        page: 1,
        limit: 20,
      });
    });

    it("trims the query before matching", async () => {
      await seed([{ title: "Forest" }]);
      expect((await search({ q: "  forest  " })).items).toEqual([
        { id: expect.any(String), title: "Forest", type: "book" },
      ]);
    });

    it.each([
      { operation: "insertion", q: "forrest" },
      { operation: "deletion", q: "forst" },
      { operation: "substitution", q: "forezt" },
      { operation: "adjacent transposition", q: "foerst" },
    ])("tolerates one $operation against a title word", async ({ q }) => {
      await seed([{ title: "The Forest Chronicles" }, { title: "Ocean" }]);
      expect(await search({ q })).toEqual({
        items: [
          {
            id: expect.any(String),
            title: "The Forest Chronicles",
            type: "book",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it("permits typo matching at exactly four query characters", async () => {
      await seed([{ title: "Dune" }]);
      expect((await search({ q: "duna" })).items).toEqual([
        { id: expect.any(String), title: "Dune", type: "book" },
      ]);
    });

    it("requires literal substring matching below four query characters", async () => {
      await seed([{ title: "Cat" }, { title: "Cut" }, { title: "Cathedral" }]);
      expect((await search({ q: "cat" })).items).toEqual([
        { id: expect.any(String), title: "Cat", type: "book" },
        { id: expect.any(String), title: "Cathedral", type: "book" },
      ]);
    });

    it("rejects two-edit matches", async () => {
      await seed([{ title: "Forest" }]);
      expect(await search({ q: "farast" })).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it("uses literal substring matching for multiword queries", async () => {
      await seed([
        { title: "The Forest Chronicles" },
        { title: "The Forest Chroniclez" },
      ]);
      expect((await search({ q: "forest chronicles" })).items).toEqual([
        {
          id: expect.any(String),
          title: "The Forest Chronicles",
          type: "book",
        },
      ]);
    });

    it.each([".", "*", "[", "a+b"])(
      "treats %s literally rather than as regex syntax",
      async (q) => {
        await seed([
          { title: `Symbol ${q} story` },
          { title: "Ordinary story" },
        ]);
        expect((await search({ q })).items).toEqual([
          { id: expect.any(String), title: `Symbol ${q} story`, type: "book" },
        ]);
      },
    );

    it.each([undefined, "", "   ", "forest", "forrest"])(
      "isolates the authenticated user's content for query %j",
      async (q) => {
        await seed([
          { title: "Forest", user_id: otherUserId },
          { title: "Forest" },
          { title: "Forest adventures", user_id: otherUserId },
        ]);
        expect(await search(q === undefined ? {} : { q })).toEqual({
          items: [{ id: expect.any(String), title: "Forest", type: "book" }],
          total: 1,
          page: 1,
          limit: 20,
        });
      },
    );

    describe.each([undefined, "forest", "forrest"])(
      "filters with query %j",
      (q) => {
        beforeEach(async () => {
          await seed([
            { title: "A Forest", type: "book" },
            { title: "B Forest", type: "anime" },
            { title: "C Forest", type: "book", language: secondLanguageId },
            { title: "D Forest", type: "anime", language: secondLanguageId },
          ]);
        });

        it("filters by language alone", async () => {
          expect(await search({ q, language: secondLanguageId })).toEqual({
            items: [
              { id: expect.any(String), title: "C Forest", type: "book" },
              { id: expect.any(String), title: "D Forest", type: "anime" },
            ],
            total: 2,
            page: 1,
            limit: 20,
          });
        });

        it("filters by type alone", async () => {
          expect(await search({ q, type: "anime" })).toEqual({
            items: [
              { id: expect.any(String), title: "B Forest", type: "anime" },
              { id: expect.any(String), title: "D Forest", type: "anime" },
            ],
            total: 2,
            page: 1,
            limit: 20,
          });
        });

        it("requires both supplied filters to match", async () => {
          expect(
            await search({ q, type: "anime", language: secondLanguageId }),
          ).toEqual({
            items: [
              { id: expect.any(String), title: "D Forest", type: "anime" },
            ],
            total: 1,
            page: 1,
            limit: 20,
          });
        });
      },
    );

    it("returns no matches for an unrelated title", async () => {
      await seed([{ title: "Forest" }]);
      expect(await search({ q: "ocean" })).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it("returns no matches for a valid nonexistent language", async () => {
      await seed([{ title: "Forest" }]);
      expect(
        await search({ language: new Types.ObjectId().toHexString() }),
      ).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it("keeps different types with the same title and includes completed content", async () => {
      await seed([
        { title: "Forest", type: "manga", completed: true },
        { title: "Forest", type: "anime" },
      ]);
      expect(await search({ q: "forest" })).toEqual({
        items: [
          { id: expect.any(String), title: "Forest", type: "anime" },
          { id: expect.any(String), title: "Forest", type: "manga" },
        ],
        total: 2,
        page: 1,
        limit: 20,
      });
    });

    it.each([undefined, "forest"])(
      "paginates globally alphabetical matches for query %j",
      async (q) => {
        const titles = Array.from(
          { length: 25 },
          (_, i) =>
            `${String(i).padStart(2, "0")} ${i % 2 ? "forest" : "Forest"}`,
        );
        await seed([...titles].reverse().map((title) => ({ title })));
        const first = await search({ q });
        const second = await search({ q, page: 2 });
        expect(first).toEqual({
          items: titles
            .slice(0, 20)
            .map((title) => ({ id: expect.any(String), title, type: "book" })),
          total: 25,
          page: 1,
          limit: 20,
        });
        expect(second).toEqual({
          items: titles
            .slice(20)
            .map((title) => ({ id: expect.any(String), title, type: "book" })),
          total: 25,
          page: 2,
          limit: 20,
        });
        expect(
          [...first.items, ...second.items].map((item) => item.title),
        ).toEqual(titles);
      },
    );

    it("orders globally ignoring case, rather than ranking exact matches first", async () => {
      await seed([
        { title: "Forest" },
        { title: "Z Forest" },
        { title: "a Forest" },
        { title: "B Forest" },
      ]);
      expect(await search({ q: "forest", limit: 2 })).toEqual({
        items: [
          { id: expect.any(String), title: "a Forest", type: "book" },
          { id: expect.any(String), title: "B Forest", type: "book" },
        ],
        total: 4,
        page: 1,
        limit: 2,
      });
      expect(await search({ q: "forest", page: 2, limit: 2 })).toEqual({
        items: [
          { id: expect.any(String), title: "Forest", type: "book" },
          { id: expect.any(String), title: "Z Forest", type: "book" },
        ],
        total: 4,
        page: 2,
        limit: 2,
      });
    });

    it("uses type to break title ties across page boundaries", async () => {
      await seed([
        { title: "Forest", type: "manga" },
        { title: "Forest", type: "anime" },
      ]);
      expect((await search({ limit: 1 })).items).toEqual([
        { id: expect.any(String), title: "Forest", type: "anime" },
      ]);
      expect((await search({ page: 2, limit: 1 })).items).toEqual([
        { id: expect.any(String), title: "Forest", type: "manga" },
      ]);
    });

    it.each([undefined, "forest", "forrest"])(
      "scopes and filters before counting and paginating query %j",
      async (q) => {
        await seed([
          ...Array.from({ length: 22 }, (_, i) => ({
            title: `A${i} Forest`,
            user_id: otherUserId,
          })),
          { title: "B Forest", type: "anime" },
          { title: "C Forest", language: secondLanguageId },
          { title: "D Ocean" },
          { title: "Y Forest" },
          { title: "Z Forest" },
        ]);
        const query = {
          q,
          language: languageId,
          type: "book" as const,
          limit: 1,
        };
        const expected =
          q === undefined
            ? ["D Ocean", "Y Forest", "Z Forest"]
            : ["Y Forest", "Z Forest"];
        for (const [index, title] of expected.entries()) {
          expect(await search({ ...query, page: index + 1 })).toEqual({
            items: [{ id: expect.any(String), title, type: "book" }],
            total: expected.length,
            page: index + 1,
            limit: 1,
          });
        }
        expect(await search({ ...query, page: 10 })).toEqual({
          items: [],
          total: expected.length,
          page: 10,
          limit: 1,
        });
      },
    );
  });
});
