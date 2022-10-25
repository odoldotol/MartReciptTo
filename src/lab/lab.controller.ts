import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { LabService } from './lab.service';

@Controller('lab')
export class LabController {
    constructor(
        private readonly labService: LabService,
    ) {};
    
    /**
     * 더이상 사용하지 않음
     */
    // @Post()
    // @UseInterceptors(FileInterceptor('receiptImage'/*, {options} */))
    // sendGoogleVisionAnnotateResultToLabs(@UploadedFile() reciptImage: Express.Multer.File, @Body() multipartBody: MultipartBodyDto) {
    //     return this.reciptToSheetService.sendGoogleVisionAnnotateResultToLabs(reciptImage, multipartBody);
    // };

    /**
     * #### readFailures 조회
     * - 필요시 갯수나 필터를 줄수있게 업뎃하면 좋겠다
     */
    @Get('readFailures')
    getReadFailures() {
        return this.labService.getReadFailures();
    };

    /**
     * #### getImage
     */
    @Post('image')
    getImage(@Body() body: {imageFileName: string}) {
        return this.labService.downloadImage(body.imageFileName);
    };

    /**
     * #### 작업할 annoRes 를 로컬 LAB 으로 가져오기
     */
    @Post('write-annores')
    writeAnnoResByImageAddress(@Body() body: {imageAddress: string}) {
        return this.labService.writeAnnoResByImageAddress(body.imageAddress);
    };
 
    /**
     * #### EXPECTED 생성
     * - 추후에 필터를 줘서 다운로드할 수 있도록 개선하자.
     */
    @Post('download-receipts-to-expected')
    downloadReceiptsToExpected() {
        return this.labService.downloadReceiptsToExpected();
    };
 
    /**
     * #### TEST (로컬의 EXPECTED vs 주어진 GET 버젼으로 DB 의 AnnoRes 를 읽은 결과물)
     * 해결된 문제점과 새로 생긴 문제점을 찾아내야한다.
     */
    @Get('test')
    testGetOnDB(@Query('getVersion') getVersion: string) {
        return this.labService.testGetOnDB(getVersion);
    };
 
    /**
     * #### Expected 다시쓰기
     */
    @Put('overwrite-expected')
    overwriteExpectedByGet(@Query('getVersion') getVersion: string, @Body() imageAddresses: string[]) {
        return this.labService.overwriteExpectedByGet(getVersion, imageAddresses);
    };
 
    /**
     * #### 업데이터
     * - 추후에 필터를 줘서 업데이트할 수 있도록 개선하자.
     */
    @Post('update-get')
    updateGet(@Query('getVersion') getVersion: string) {
        return this.labService.updateGet(getVersion);
    };
}
