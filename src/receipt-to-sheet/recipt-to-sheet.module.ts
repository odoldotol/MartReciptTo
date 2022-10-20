import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReciptToSheetController } from './recipt-to-sheet.controller';
import { ReciptToSheetService } from './recipt-to-sheet.service';
import { Annotate_response, Annotate_responseSchema } from './schemas/annotate_response.schema';
import { Read_failure, Read_failureSchema } from './schemas/read_failure.schema';
import { Receipt, ReceiptSchema } from './schemas/receipt.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Read_failure.name, schema: Read_failureSchema },
      { name: Receipt.name, schema: ReceiptSchema },
      { name: Annotate_response.name, schema: Annotate_responseSchema },
    ])
  ],
  controllers: [ReciptToSheetController],
  providers: [ReciptToSheetService],
  exports: [MongooseModule, ReciptToSheetService]
})
export class ReciptToSheetModule {}
