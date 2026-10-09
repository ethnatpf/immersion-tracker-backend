import { Body, Controller, Post } from "@nestjs/common";
import { CreateContentDto } from "./dto/create-content.dto.js";

@Controller("content")
export class ContentController {
  @Post()
  create(@Body() _input: CreateContentDto): void {
    // Persistence will be added in a later TDD step.
  }
}
