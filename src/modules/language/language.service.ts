import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Language } from "./schemas/language.schema.js";
import type { LanguageResponseDto } from "./dto/language-response.dto.js";

@Injectable()
export class LanguageService {
  constructor(
    @InjectModel(Language.name) private readonly languageModel: Model<Language>,
  ) {}

  async findAll(): Promise<LanguageResponseDto[]> {
    const languages = await this.languageModel
      .find({})
      .select({ _id: 1, code: 1, name: 1, nativeName: 1 })
      .lean()
      .exec();

    return languages.map(({ _id, code, name, nativeName }) => ({
      id: _id.toHexString(),
      code,
      name,
      nativeName,
    }));
  }
}
