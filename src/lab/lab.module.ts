import { Module } from '@nestjs/common';
import { ReciptToSheetModule } from '../receipt-to-sheet/recipt-to-sheet.module';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';

@Module({
  imports: [ReciptToSheetModule],
  controllers: [LabController],
  providers: [LabService]
})
export class LabModule {}
