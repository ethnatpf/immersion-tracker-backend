import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CreateContentDto } from "./dto/create-content.dto.js";
import { SearchContentDto } from "./dto/search-content.dto.js";
import { ContentService } from "./content.service.js";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
} from "@nestjs/swagger";
import { GetContentDto } from "./dto/get-content.dto.js";
import { UpdateContentDto } from "./dto/update-content.dto.js";
import { ContentResponseDto } from "./dto/content-response.dto.js";
import { ContentSearchResponseDto } from "./dto/content-search-response.dto.js";
import { ContentDetailsResponseDto } from "./dto/content-details-response.dto.js";
import type { ContentDocument } from "./schemas/content.schema.js";

@ApiBearerAuth()
@Controller("content")
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get("search")
  @ApiOkResponse({ type: ContentSearchResponseDto })
  search(
    @Query() input: SearchContentDto,
    @CurrentUserId() userId: string,
  ): Promise<ContentSearchResponseDto> {
    return this.contentService.search(input, userId);
  }

  @Get(":id")
  @ApiOkResponse({ type: ContentDetailsResponseDto })
  getById(
    @Param() params: GetContentDto,
    @CurrentUserId() userId: string,
  ): Promise<ContentDetailsResponseDto> {
    return this.contentService.getById(params.id, userId);
  }

  @Post()
  @ApiCreatedResponse({ type: ContentResponseDto })
  create(
    @Body() input: CreateContentDto,
    @CurrentUserId() userId: string,
  ): Promise<ContentDocument> {
    return this.contentService.create(input, userId);
  }

  @Patch(":id")
  @ApiOkResponse({ type: ContentResponseDto })
  update(
    @Param() params: GetContentDto,
    @Body() input: UpdateContentDto,
    @CurrentUserId() userId: string,
  ): Promise<ContentDocument> {
    return this.contentService.update(params.id, input, userId);
  }
}
