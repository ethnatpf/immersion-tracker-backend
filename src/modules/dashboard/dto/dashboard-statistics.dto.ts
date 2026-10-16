import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsMongoId } from "class-validator";

export type DashboardRange = "total" | "year" | "month" | "week";

export class DashboardStatisticsDto {
  @IsIn(["total", "year", "month", "week"])
  range: DashboardRange;

  @ApiProperty({ description: "Language ID" })
  @IsMongoId()
  language: string;
}
