import { BadRequestException, Body, Controller, Get, Post, Query, Redirect, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { MultipartBodyDto } from './dto/multipartBody.dto';
import { ReciptToSheetService } from './recipt-to-sheet.service';

@Controller('receipt-to-sheet')
export class ReciptToSheetController {
    constructor(
        private readonly configService: ConfigService,
        private readonly reciptToSheetService: ReciptToSheetService
    ) {};
    
    /**
     * #### 메인
     */
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


    // lab module 분리하기?

    /**
     * 더이상 사용하지 않음
     */
    // @Post('lab')
    // @UseInterceptors(FileInterceptor('receiptImage'/*, {options} */))
    // sendGoogleVisionAnnotateResultToLabs(@UploadedFile() reciptImage: Express.Multer.File, @Body() multipartBody: MultipartBodyDto) {
    //     return this.reciptToSheetService.sendGoogleVisionAnnotateResultToLabs(reciptImage, multipartBody);
    // };

    /**
     * #### 작업할 annoRes 를 로컬 LAB 으로 가져오기
     */
    @Post('lab/write-annores')
    writeAnnoResByImageUri(@Body() body: {imageUri: string}) {
        return this.reciptToSheetService.writeAnnoResByImageUri(body);
    };

    /**
     * #### EXPECTED 생성
     * - 추후에 필터를 줘서 다운로드할 수 있도록 개선하자.
     */
    @Post('lab/download-receipts-to-expected')
    downloadReceiptsToExpected() {
        return this.reciptToSheetService.downloadReceiptsToExpected();
    };

    /**
     * #### TEST (로컬의 EXPECTED vs 주어진 GET 버젼으로 DB 의 AnnoRes 를 읽은 결과물)
     * 해결된 문제점과 새로 생긴 문제점을 찾아내야한다.
     */
    @Get('lab/test')
    testGetOnDB(@Query('getVersion') getVersion: string) {
        return this.reciptToSheetService.testGetOnDB(getVersion);
    };

    /**
     * #### 업데이터
     * - 추후에 필터를 줘서 업데이트할 수 있도록 개선하자.
     */
    @Post('updater')
    reReadAnnoResAndUpdateDB() {
        return this.reciptToSheetService.reReadAnnoResAndUpdateDB();
    };
};
