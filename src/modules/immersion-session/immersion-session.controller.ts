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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from "@nestjs/swagger";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { CreateImmersionSessionDto } from "./dto/create-immersion-session.dto.js";
import { ImmersionSessionService } from "./immersion-session.service.js";
import { SessionHistoryDto } from "./dto/session-history.dto.js";
import { DeleteImmersionSessionDto } from "./dto/delete-immersion-session.dto.js";
import { ImmersionSessionResponseDto } from "./dto/immersion-session-response.dto.js";
import { SessionHistoryResponseDto } from "./dto/session-history-response.dto.js";
import type { ImmersionSessionDocument } from "./schemas/immersion-session.schema.js";
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
  @ApiOkResponse({ type: SessionHistoryResponseDto })
  history(
    @Query() input: SessionHistoryDto,
    @CurrentUserId() userId: string,
  ): Promise<SessionHistoryResponseDto> {
    return this.immersionSessionService.history(input, userId);
  }

  @Post()
  @ApiCreatedResponse({ type: ImmersionSessionResponseDto })
  create(
    @Body() input: CreateImmersionSessionDto,
    @CurrentUserId() userId: string,
  ): Promise<ImmersionSessionDocument> {
    return this.immersionSessionService.create(input, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Immersion session deleted" })
  remove(
    @Param() params: DeleteImmersionSessionDto,
    @CurrentUserId() userId: string,
  ): Promise<void> {
    return this.immersionSessionService.remove(params.id, userId);
  }

  @Patch(":id")
  @ApiOkResponse({ type: ImmersionSessionResponseDto })
  update(
    @Param() params: UpdateImmersionSessionParamsDto,
    @Body() input: UpdateImmersionSessionDto,
    @CurrentUserId() userId: string,
  ): Promise<ImmersionSessionDocument> {
    return this.immersionSessionService.update(params.id, input, userId);
  }
}
