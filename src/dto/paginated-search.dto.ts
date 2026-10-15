import { Transform } from "class-transformer";
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

function toNumber(value: unknown): unknown {
  return typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : value;
}

export class PaginatedSearchDto {
  @ValidateIf(
    (_object: PaginatedSearchDto, value: unknown) => value !== undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MaxLength(350)
  q?: string;

  @ValidateIf(
    (_object: PaginatedSearchDto, value: unknown) => value !== undefined,
  )
  @Transform(({ value }: { value: unknown }) => toNumber(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ValidateIf(
    (_object: PaginatedSearchDto, value: unknown) => value !== undefined,
  )
  @Transform(({ value }: { value: unknown }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
