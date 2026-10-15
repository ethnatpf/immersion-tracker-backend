import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { CreateImmersionSessionDto } from "./dto/create-immersion-session.dto.js";
import { ImmersionSessionService } from "./immersion-session.service.js";
import { SessionHistoryDto } from "./dto/session-history.dto.js";

@ApiBearerAuth()
@Controller("immersion-session")
export class ImmersionSessionController {
  constructor(
    private readonly immersionSessionService: ImmersionSessionService,
  ) {}

  @Get()
  history(@Query() input: SessionHistoryDto, @CurrentUserId() userId: string) {
    return this.immersionSessionService.history(input, userId);
  }

  @Post()
  create(
    @Body() input: CreateImmersionSessionDto,
    @CurrentUserId() userId: string,
  ) {
    return this.immersionSessionService.create(input, userId);
  }
}
