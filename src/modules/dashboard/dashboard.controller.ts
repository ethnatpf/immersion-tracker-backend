import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { DashboardStatisticsDto } from "./dto/dashboard-statistics.dto.js";
import { DashboardStatisticsResponseDto } from "./dto/dashboard-statistics-response.dto.js";
import { DashboardService } from "./dashboard.service.js";

@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("statistics")
  @ApiOkResponse({ type: DashboardStatisticsResponseDto })
  statistics(
    @Query() input: DashboardStatisticsDto,
    @CurrentUserId() userId: string,
  ): Promise<DashboardStatisticsResponseDto> {
    return this.dashboardService.statistics(input, userId);
  }
}
