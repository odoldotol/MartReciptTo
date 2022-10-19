import { Test, TestingModule } from '@nestjs/testing';
import { ReciptToSheetController } from './recipt-to-sheet.controller';

describe('ReciptToSheetController', () => {
  let controller: ReciptToSheetController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReciptToSheetController],
    }).compile();

    controller = module.get<ReciptToSheetController>(ReciptToSheetController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
