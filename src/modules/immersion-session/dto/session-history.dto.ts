import {
  IsDateString,
  IsIn,
  IsMongoId,
  Matches,
  ValidateBy,
  ValidateIf,
} from "class-validator";
import { PaginatedSearchDto } from "../../../dto/paginated-search.dto.js";
import type { Content } from "../../content/schemas/content.schema.js";

export class SessionHistoryDto extends PaginatedSearchDto {
  @ValidateIf(
    (_object: SessionHistoryDto, value: unknown) => value !== undefined,
  )
  @IsMongoId()
  content?: string;

  @ValidateIf(
    (_object: SessionHistoryDto, value: unknown) => value !== undefined,
  )
  @IsIn(["anime", "book", "manga", "drama", "video"])
  type?: Content["type"];

  @ValidateIf(
    (_object: SessionHistoryDto, value: unknown) => value !== undefined,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  @IsDateString({ strict: true })
  start_date?: string;

  @ValidateIf(
    (_object: SessionHistoryDto, value: unknown) => value !== undefined,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  @IsDateString({ strict: true })
  @ValidateBy({
    name: "isValidHistoryDateRange",
    validator: {
      validate: (value: unknown, args) => {
        const start = (args?.object as SessionHistoryDto | undefined)
          ?.start_date;
        return (
          typeof value === "string" &&
          (start === undefined || (typeof start === "string" && value >= start))
        );
      },
      defaultMessage: () => "end_date must be on or after start_date",
    },
  })
  end_date?: string;
}
