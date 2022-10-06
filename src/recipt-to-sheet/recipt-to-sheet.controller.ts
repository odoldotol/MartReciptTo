import { BadRequestException, Body, Controller, Post, Redirect, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { MultipartBodyDto } from './dto/multipartBody.dto';
import { ReciptToSheetService } from './recipt-to-sheet.service';

@Controller('receipt-to-sheet')
export class ReciptToSheetController {
    constructor(
        private readonly configService: ConfigService,
        private readonly reciptToSheetService: ReciptToSheetService
    ) {}
    
    @Post()
    @UseInterceptors(FileInterceptor('receiptImage'/*, {options} */))
    async processingTransferredReceipt(@UploadedFile() reciptImage: Express.Multer.File, @Body() multipartBody: MultipartBodyDto) { // 지금은 단일 이미지만 처리한다. 추후에는 여러 영수증이미지를 받아서 처리할 수 있도록 하자.
        if (!reciptImage) {
            throw new BadRequestException('receipt image is required');
        };
        if (multipartBody.password !== this.configService.get('Temporary_PASSWORD')) {
            throw new UnauthorizedException();
        };
        const requestDate = new Date();
        // FE
        const {annoRes, imageUri} = await this.reciptToSheetService.processingReceiptImage(reciptImage);
        // BE
        return this.reciptToSheetService.processingAnnoRes(annoRes, imageUri, multipartBody, requestDate); // imageUri 는 나중에 body 로 들어온다
    };

    // @Post('lab')
    // @UseInterceptors(FileInterceptor('receiptImage'/*, {options} */))
    // sendGoogleVisionAnnotateResultToLabs(@UploadedFile() reciptImage: Express.Multer.File, @Body() multipartBody: MultipartBodyDto) {
    //     return this.reciptToSheetService.sendGoogleVisionAnnotateResultToLabs(reciptImage, multipartBody);
    // };
};
