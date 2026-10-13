import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsObject,
  Matches,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { SessionProgress } from "../schemas/immersion-session.schema.js";

export class SessionProgressDto implements SessionProgress {
  @IsIn(["episode", "page"])
  unit: SessionProgress["unit"];

  @IsInt()
  @Min(1)
  start: number;

  @IsInt()
  @Min(1)
  @ValidateBy({
    name: "isValidProgressRange",
    validator: {
      validate: (value: unknown, args) =>
        typeof value === "number" &&
        args !== undefined &&
        value >= (args.object as SessionProgressDto).start,
      defaultMessage: () => "end must be greater than or equal to start",
    },
  })
  end: number;
}

export class CreateImmersionSessionDto {
  @IsMongoId()
  content: string;

  @IsInt()
  @Min(1)
  duration: number;

  @ValidateIf(
    (_object: CreateImmersionSessionDto, value: unknown) => value !== undefined,
  )
  @IsObject()
  @ValidateNested()
  @Type(() => SessionProgressDto)
  progress?: SessionProgressDto;

  @ValidateIf(
    (_object: CreateImmersionSessionDto, value: unknown) => value !== undefined,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  @IsDateString({ strict: true })
  @ValidateBy({
    name: "isNotFutureDay",
    validator: {
      validate: (value: unknown) =>
        typeof value === "string" &&
        value <= new Date().toISOString().slice(0, 10),
      defaultMessage: () => "created_at must not be a future date",
    },
  })
  created_at?: string;
}
