import "reflect-metadata";
import { getConnectionToken, getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import type { AuthOptions } from "express-oauth2-jwt-bearer";
import type { Types } from "mongoose";
import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/configure-app.js";
import { Content } from "../../src/modules/content/schemas/content.schema.js";
import { ImmersionSession } from "../../src/modules/immersion-session/schemas/immersion-session.schema.js";
import { Language } from "../../src/modules/language/schemas/language.schema.js";

// Support either Model.create() or new Model().save() without MongoDB.
class ModelStub {
  constructor(values: Record<string, unknown>) {
    Object.assign(this, values);
  }

  static async create(values: Record<string, unknown>) {
    return new ModelStub(values);
  }

  async save() {
    return this;
  }
}

export async function createTestApp(
  authorization: AuthOptions,
  options: {
    languageIds?: string[];
    languages?: {
      _id: Types.ObjectId;
      code: string;
      name: string;
      __v?: number;
    }[];
  } = {},
) {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getConnectionToken())
    .useValue({ close: async () => {} });

  for (const model of [Content, ImmersionSession]) {
    builder.overrideProvider(getModelToken(model.name)).useValue(ModelStub);
  }
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
