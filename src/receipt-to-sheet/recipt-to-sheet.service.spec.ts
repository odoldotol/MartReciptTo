import { Test, TestingModule } from '@nestjs/testing';
import { ReciptToSheetService } from './recipt-to-sheet.service';

describe('ReciptToSheetService', () => {
  let service: ReciptToSheetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReciptToSheetService],
    }).compile();

    service = module.get<ReciptToSheetService>(ReciptToSheetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
