import "reflect-metadata";
import { getConnectionToken, getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import type { AuthOptions } from "express-oauth2-jwt-bearer";
import { Mongoose, type Types } from "mongoose";
import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/configure-app.js";
import { Content } from "../../src/modules/content/schemas/content.schema.js";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "../../src/modules/immersion-session/schemas/immersion-session.schema.js";
import { Language } from "../../src/modules/language/schemas/language.schema.js";
import {
  Timer,
  TimerSchema,
} from "../../src/modules/timer/schemas/timer.schema.js";

// Support either Model.create() or new Model().save() without MongoDB.
class ModelStub {
  constructor(values: Record<string, unknown>) {
    Object.assign(this, values);
  }

  static async create(values: Record<string, unknown>) {
    return new this(values);
  }

  async save() {
    return this;
  }
}

export async function createTestApp(
  authorization: AuthOptions,
  options: {
    contents?: {
      _id: string;
      user_id: string;
      language: string;
      type: string;
    }[];
    languageIds?: string[];
    languages?: {
      _id: Types.ObjectId;
      code: string;
      name: string;
      nativeName: string;
      __v?: number;
    }[];
  } = {},
) {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getConnectionToken())
    .useValue({ close: async () => {} });

  class ContentModelStub extends ModelStub {
    static collection = { name: "contents" };

    static findOne(query: { _id: string; user_id: string }) {
      return {
        select: () => ({
          exec: async () => {
            const content = options.contents?.find(
              (entry) =>
                entry._id.toLowerCase() ===
                  query._id.toString().toLowerCase() &&
                entry.user_id === query.user_id,
            );
            return content ?? null;
          },
        }),
      };
    }

    static exists(query: { _id: string; user_id: string }) {
      return {
        exec: async () =>
          options.contents?.find(
            (content) =>
              content._id.toLowerCase() ===
                query._id.toString().toLowerCase() &&
              content.user_id === query.user_id,
          ) ?? null,
      };
    }
  }
  builder
    .overrideProvider(getModelToken(Content.name))
    .useValue(ContentModelStub);
  // Apply actual schema casting/defaults without connecting to MongoDB.
  const sessionModel = new Mongoose().model(
    ImmersionSession.name,
    ImmersionSessionSchema,
  );
  class SessionModelStub extends ModelStub {
    static aggregate() {
      return { exec: async () => [] };
    }

    constructor(values: Record<string, unknown>) {
      super(new sessionModel(values).toObject<Record<string, unknown>>());
    }
  }
  builder
    .overrideProvider(getModelToken(ImmersionSession.name))
    .useValue(SessionModelStub);
  const timerModel = new Mongoose().model(Timer.name, TimerSchema);
  const timers: TimerModelStub[] = [];
  class TimerModelStub extends ModelStub {
    declare user_id: string;

    constructor(values: Record<string, unknown>) {
      super(new timerModel(values).toObject<Record<string, unknown>>());
    }

    static findOne({ user_id }: { user_id: string }) {
      return {
        exec: async () =>
          timers.find((timer) => timer.user_id === user_id) ?? null,
      };
    }

    static exists(query: { user_id: string }) {
      return this.findOne(query);
    }

    static override async create(values: Record<string, unknown>) {
      return new this(values).save();
    }

    override async save() {
      timers.push(this);
      return this;
    }
  }
  builder.overrideProvider(getModelToken(Timer.name)).useValue(TimerModelStub);
  const languageIds = new Set(options.languageIds ?? []);
  builder.overrideProvider(getModelToken(Language.name)).useValue({
    find: () => ({
      select: () => ({
        lean: () => ({ exec: async () => options.languages ?? [] }),
      }),
    }),
    exists: ({ _id }: { _id: string }) => ({
      exec: async () => (languageIds.has(_id.toLowerCase()) ? { _id } : null),
    }),
  });

  const module = await builder.compile();
  const app = module.createNestApplication();
  configureApp(app, { authorization });
  await app.init();
  return app;
}
