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
import { FULL_DATE_TIME_WITH_TIMEZONE_REGEX } from "~/constants.js";
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
  @Matches(FULL_DATE_TIME_WITH_TIMEZONE_REGEX)
  @IsDateString({ strict: true })
  created_at?: string;
}
