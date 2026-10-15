import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { CreateImmersionSessionDto } from "./dto/create-immersion-session.dto.js";
import { ImmersionSessionService } from "./immersion-session.service.js";
import { SessionHistoryDto } from "./dto/session-history.dto.js";
import { DeleteImmersionSessionDto } from "./dto/delete-immersion-session.dto.js";
import {
  UpdateImmersionSessionDto,
  UpdateImmersionSessionParamsDto,
} from "./dto/update-immersion-session.dto.js";

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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param() params: DeleteImmersionSessionDto,
    @CurrentUserId() userId: string,
  ) {
    return this.immersionSessionService.remove(params.id, userId);
  }

  @Patch(":id")
  update(
    @Param() params: UpdateImmersionSessionParamsDto,
    @Body() input: UpdateImmersionSessionDto,
    @CurrentUserId() userId: string,
  ) {
    return this.immersionSessionService.update(params.id, input, userId);
  }
}
