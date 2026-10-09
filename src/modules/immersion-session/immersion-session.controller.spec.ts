import { Test, TestingModule } from "@nestjs/testing";
import { ImmersionSessionController } from "./immersion-session.controller.js";

describe("ImmersionSessionsController", () => {
  let controller: ImmersionSessionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImmersionSessionController],
    }).compile();

    controller = module.get<ImmersionSessionController>(
      ImmersionSessionController,
    );
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
