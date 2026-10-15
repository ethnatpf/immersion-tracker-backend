import { Type } from "class-transformer";
import { PickType } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsObject,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  CreateImmersionSessionDto,
  SessionProgressDto,
} from "./create-immersion-session.dto.js";

export class UpdateImmersionSessionParamsDto {
  @IsMongoId()
  id: string;
}

export class UpdateSessionProgressDto extends PickType(SessionProgressDto, [
  "start",
  "end",
] as const) {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(["episode", "page"])
  unit?: SessionProgressDto["unit"];
}

export class UpdateImmersionSessionDto extends PickType(
  CreateImmersionSessionDto,
  ["created_at"] as const,
) {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  duration?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateSessionProgressDto)
  progress?: UpdateSessionProgressDto;
}
