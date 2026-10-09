import {
  IsIn,
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from "class-validator";
import type { Content } from "../schemas/content.schema.js";

export class CreateContentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(350)
  title: string;

  @IsString()
  @IsIn(["anime", "book", "manga", "drama", "video"])
  type: Content["type"];

  @IsString()
  @IsNotEmpty()
  language: string;

  // Only omission is optional; null must still fail validation.
  @ValidateIf((_object: CreateContentDto, value: unknown) => value !== undefined)
  @IsString()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  url?: string;
}
