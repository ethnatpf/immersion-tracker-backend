import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsMongoId, IsTimeZone, Matches } from "class-validator";

export type DashboardRange = "total" | "year" | "month" | "week";

export class DashboardStatisticsDto {
  @IsIn(["total", "year", "month", "week"])
  range: DashboardRange;

  @ApiProperty({ description: "Language ID" })
  @IsMongoId()
  language: string;

  @ApiProperty({
    description: "IANA timezone used for calendar boundaries and buckets",
    example: "America/Toronto",
  })
  @Matches(/^(?![+-]\d{2}(?::?\d{2})?$)/u, {
    message: "timezone must be an IANA timezone name, not a UTC offset",
  })
  @IsTimeZone()
  timezone: string;
}
