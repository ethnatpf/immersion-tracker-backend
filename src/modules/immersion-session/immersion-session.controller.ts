import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { CreateImmersionSessionDto } from "./dto/create-immersion-session.dto.js";
import { ImmersionSessionService } from "./immersion-session.service.js";

@ApiBearerAuth()
@Controller("immersion-session")
export class ImmersionSessionController {
  constructor(
    private readonly immersionSessionService: ImmersionSessionService,
  ) {}

  @Post()
  create(
    @Body() input: CreateImmersionSessionDto,
    @CurrentUserId() userId: string,
  ) {
    return this.immersionSessionService.create(input, userId);
  }
}
