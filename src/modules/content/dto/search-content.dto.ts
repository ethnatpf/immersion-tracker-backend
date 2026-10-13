import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import type { Content } from "../schemas/content.schema.js";

function toNumber(value: unknown): unknown {
  return typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : value;
}

export class SearchContentDto {
  @ValidateIf(
    (_object: SearchContentDto, value: unknown) => value !== undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MaxLength(350)
  q?: string;

  @ValidateIf(
    (_object: SearchContentDto, value: unknown) => value !== undefined,
  )
  @IsMongoId()
  language?: string;

  @ValidateIf(
    (_object: SearchContentDto, value: unknown) => value !== undefined,
  )
  @IsIn(["anime", "book", "manga", "drama", "video"])
  type?: Content["type"];

  @ValidateIf(
    (_object: SearchContentDto, value: unknown) => value !== undefined,
  )
  @Transform(({ value }: { value: unknown }) => toNumber(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ValidateIf(
    (_object: SearchContentDto, value: unknown) => value !== undefined,
  )
  @Transform(({ value }: { value: unknown }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
