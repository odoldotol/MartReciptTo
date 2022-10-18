import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import {Storage} from '@google-cloud/storage';
import credentials from '../../credential.json';
import sgMail from '@sendgrid/mail';
import { ConfigService } from '@nestjs/config';
import xlsx from 'xlsx'
import googleVisionAnnoInspectorPipe from '../receiptObj/googleVisionAnnoPipe/inspector.V0.0.1';
import * as receiptObject from '../receiptObj';
import { MultipartBodyDto } from './dto/multipartBody.dto';
import { writeFile, readdir, readFile} from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid'
import { Receipt } from '../receiptObj/define.V0.1.1' // Receipt Version
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Receipt as ReceiptSchemaClass, ReceiptDocument } from './schemas/receipt.schema';
import { Annotate_response, Annotate_responseDocument } from './schemas/annotate_response.schema';
import { Read_failure, Read_failureDocument } from './schemas/read_failure.schema';
import convert from 'heic-convert';
import uriPathConverter from '../util/uriPathConverter';

@Injectable()
export class ReciptToSheetService {

    private readonly imageAnnotatorClient: ImageAnnotatorClient
    private readonly sgMail
    private readonly googleCloudStorage: Storage
    private readonly bucketName: string
    private readonly getReceiptObject

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(Annotate_response.name) private annotateResponseModel: Model<Annotate_responseDocument>,
        @InjectModel(ReceiptSchemaClass.name) private receiptModel: Model<ReceiptDocument>,
        @InjectModel(Read_failure.name) private readFailureModel: Model<Read_failureDocument>,
    ) {
        this.imageAnnotatorClient = new ImageAnnotatorClient({credentials});
        this.sgMail = sgMail.setApiKey(this.configService.get('SENDGRID_API_KEY'))
        this.googleCloudStorage = new Storage({credentials});

        if (this.configService.get('MONGO_database') === "receiptTo") {
            this.bucketName = "receipt-image-dev"
        }
        else if (this.configService.get('MONGO_database') === "receiptTo-test") {
            this.bucketName = "receipt-image-test"
        }
        else {
            console.log('MONGO_database: ', this.configService.get('MONGO_database'))
            throw new InternalServerErrorException("failed to set bucketName")
        };

        this.getReceiptObject = receiptObject.get_V0_2_1; // Receipt Version
    };

    /**
     * FE
     */
    async processingReceiptImage(reciptImage: Express.Multer.File) { 
        // heic 형식일 경우 jpeg 로 변환 // 폰에서는 자동변환되는것같다?
        let buffer
        let mimetype
        if (reciptImage.mimetype === "image/heic") {
            buffer = await convert({
                buffer: reciptImage.buffer,
                format: 'JPEG',
                quality: 1
            });
            mimetype = "image/jpeg"
        } else {
            buffer = reciptImage.buffer
            mimetype = reciptImage.mimetype
        };

        // 영수증인지 확인하기? (optional, potentially essential)

        // Google Cloud 에 이미지 업로드
        const filename = await this.uploadImageToGCS(mimetype, buffer)

        // 구글 비젼 API 돌리기
        const imageUri = `gs://${this.bucketName}/${filename}`
        const annoRes = await this.annotateGscImage(imageUri)
        return { annoRes, imageUri };
    };

    /**
     * BE Main
     */
    async processingAnnoRes(annoRes, imageUri: string, multipartBody: MultipartBodyDto, requestDate: Date) {

        // 생각해보니, 거꾸로였다!! 잘 만들어진 어떤 특정 영수증 솔루션에 정상 해독되면 그 특정 영수증이라고 판단하는게 더 나을수도있겠네!?
        // 우선은 영수증 이미지를 받을때 어떤 영수증인지 정보가 오게해야하고, 그게 안오거나 불확실하는걸 생각해서 저리 순서.과정을 짜자

        // 다른 폼의 영수증이라면 솔루션이 동작하지 않는다는 보장이 있을까? 그리고 이를 보장하도록 솔루션을 만드는게 효율적일지 고민 필요함
        // 영수증이 생각보다 서로 너무 비슷해서 조금 부족한 상태로 정상 작동할 우려가 있어보이기는 함
        // 일단은 한번 보장된다고 가정하고 플랜을 짜보면,
        /*
         * 1. 제공된 마트 정보를 가지고 그에 맞는 솔루션을 돌려봄
         * 
         * 2. 제공된 정보가 없으면, 영수증에서 'homeplus, 홈플러스, 이마트, emart, costco 등등' 키워드를 찾아봄
         *    찾아진 그 키워드에 해당하는 솔루션을 돌려봄
         * 
         * 3. 1,2 에서 적용한 솔루션이 잘 돌아가면 된거고 문제 있으면 다른 솔루션을 돌려봐야함
         * 
         * 4. 정상 동작하는 솔루션이 없다면
         *  - 솔루션에 문제가 있거나 (피드백 얻기)
         *  - 이미지에 문제가 있거나 (지원하지 않는 마트, 읽기에 부적합한 이미지)
         */

        // ----------------------------------------------
        // annoRes 저장하기
        const saveResult_AnnoRes = await this.saveAnnoRes(annoRes, imageUri)

        // 데이터 추출하고 영수증객체 만들기
        /*
        1. 어디 영수증인지 알아내기 -> 일단, 이 부분 무시하고 홈플러스 라고 가정
        2. 홈플러스 솔루션으로 text 추출하여 영수증객체 만들기
        */
        // 0.2.1 이전
        /*
        const {receipt, failures, permits} = this.getReceiptObject(
            googleVisionAnnoInspectorPipe(annoRes), // 파이프 돌릴떄의 발견되는 예외도 보고 받을수 있도록 수정해야함
            multipartBody,
            imageUri
        );
        */
        const {receipt, failures, permits} = this.getReceiptObject(annoRes, multipartBody, imageUri);

        // 출력 요청 만들어서 영수증 객체에 넣기
        const requestType = 'provided'
        receipt.addOutputRequest(requestDate, multipartBody.sheetFormat, multipartBody.emailAddress, requestType)

        // 출력요청 처리하기
        await this.executeOutputRequest(receipt, permits)
        
        // receipt 저장하기
        const saveResult_Receipt = await this.saveReceipt(receipt, saveResult_AnnoRes)

        let saveResult_Failures = undefined
        if (failures.length > 0) {
            // failures 저장하기
            saveResult_Failures = await this.saveFailures(failures, permits, imageUri, saveResult_AnnoRes, saveResult_Receipt)
        };

        return {receipt, permits, saveResult_Failures};
    };

    /**
     * 
     */
    async uploadImageToGCS(mimetype, buffer) {
        const destFileName = uuidv4() + "." + /(?<=image\/)[a-z]*/.exec(mimetype)[0];
        try {
            await this.googleCloudStorage.bucket(this.bucketName).file(destFileName).save(buffer);
            return destFileName;
        } catch (err) {
            throw new InternalServerErrorException(err);
        };
    };

    /**
     * 
     */
    async annotateGscImage(imageUri: string) {
        const request = {
            "image": {
                "source": {
                    imageUri
                }
            },
            "features": [
                {"type": "TEXT_DETECTION"},
                {"type": "DOCUMENT_TEXT_DETECTION"},
                {"type": "CROP_HINTS"},
                // {"type": "LOGO_DETECTION"},
            ]
        };
        try {
            const annoRes = await this.imageAnnotatorClient.annotateImage(request);
            return annoRes;
        } catch (error) {
            return {error};
        };
    };

    /**
     * 
     */
    async saveAnnoRes(response, imageAddress) {
        const newAnnotateResponse = new this.annotateResponseModel({
            imageAddress,
            response
        })
        let result
        await newAnnotateResponse.save()
            .then((res) => {
                result = res._id
            })
            .catch((err) => {
                throw new InternalServerErrorException(err)
            })
        return result
    };

    /**
     * 
     */
     async executeOutputRequest(receipt: Receipt, permits) {
        let email
        if (permits.items) {
            // Sheet 만들기 (csv | xlsx) -> attachments 만들기
            const attachments = this.createAttachments(receipt);

            // 이메일 보내기
            email = await this.sendEmail(attachments, receipt);
        }
        else {
            email = "Haven't sent an email: Permit of items is false"
        }
        // 요청 처리 결과 저장
        receipt.completeOutputRequest(email);
    };

    /**
     * 
     */
    async saveReceipt(receipt:Receipt, annotate_responseId) {
        const newReceipt = new this.receiptModel({
            ...receipt,
            annotate_responseId
        })
        let result
        await newReceipt.save()
            .then((res) => {
                result = res._id
            })
            .catch((err) => {
                throw new InternalServerErrorException(err)
            })
        return result
    };

    /**
     * 
     */
    async saveFailures(failures, permits, imageAddress, annotate_responseId, receiptId) {
        const newReadFailure = new this.readFailureModel({
            failures,
            permits,
            imageAddress,
            annotate_responseId,
            receiptId
        })
        let result
        await newReadFailure.save()
            .then((res) => {
                result = res.failures
            })
            .catch((err) => {
                throw new InternalServerErrorException(err)
            })
        return result
    };

    /**
     * 
     */
    createAttachments(receipt: Receipt) {
        const sheetFormat = receipt.outputRequests[receipt.outputRequests.length-1].sheetFormat;
        let attachment
        const date = receipt.readFromReceipt.date? receipt.readFromReceipt.date : new Date(undefined);
        if (sheetFormat === 'csv') {
            // let csvData = "0,1,2,3,4,5,6,7,8,9\n"
            // textArr[0] = '"'+textArr[0]+'"'
            // const textData = textArr.reduce((acc, cur, idx) => {
            //     if (idx%10 === 9) {
            //         return acc +','+ '"' + cur+ '"' + '\n'
            //     }
            //     else if (idx!==0 && idx%10 === 0) {
            //         return acc + '"' + cur + '"'
            //     }
            //     else {
            //         return acc +','+ '"' + cur + '"'
            //     }
            // })
            // csvData += textData
            // attachment = Buffer.from(csvData, 'utf8').toString('base64');
        }
        else if (sheetFormat === 'xlsx') { // xlsx

            const rowObjArr = receipt.itemArray.map((item, idx) => {
                return {
                    'no': idx+1,
                    '상품명': item.readFromReceipt.productName,
                    '단가': item.readFromReceipt.unitPrice,
                    '수량': item.readFromReceipt.quantity,
                    '금액': item.readFromReceipt.amount,
                    '할인총금액': item.itemDiscountAmount,
                    '구매금액': item.purchaseAmount,
                    '카테고리': item.category,
                    '부가세면세': item.readFromReceipt.taxExemption,
                }
            });

            // 할인 내용 추가
            receipt.itemArray.forEach((item, itemIdx) => {
                item.readFromReceipt.discountArray.forEach((discount, discountIdx) => {
                    rowObjArr[itemIdx][`할인${discountIdx+1}`] = discount.name
                    rowObjArr[itemIdx][`할인${discountIdx+1}코드`] = discount.code
                    rowObjArr[itemIdx][`할인${discountIdx+1}금액`] = discount.amount
                })
            })

            const wb = xlsx.utils.book_new()
            const ws = xlsx.utils.json_to_sheet(rowObjArr)

            xlsx.utils.book_append_sheet(wb, ws, `${date.toLocaleDateString('ko-KR', {timeZone: 'Asia/Seoul'})}-Homeplus`) // 결제일, 마트
            attachment = xlsx.write(wb, {type: 'base64', bookType: 'xlsx'})
        };

        return [{
            content: attachment,
            filename: `${date.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}-Homeplus.` + sheetFormat, // 마트, 시트포멧 // 복수의 이미지를 처리하게되면 신청일+???.xlsx ??
            type: "application/" + sheetFormat,
            disposition: "attachment"
        }]
    };

    /**
     * 
     */
    async sendEmail(attachments, receipt: Receipt) {
        const date = receipt.readFromReceipt.date? receipt.readFromReceipt.date : new Date(undefined);
        const msg = {
            to: receipt.outputRequests[receipt.outputRequests.length-1].emailAddress, // recipient
            from: 'service.lygo@gmail.com', // verified sender
            subject: `${date.getFullYear()}년 ${date.getMonth()+1}월 ${date.getDate()}일 결제하신 홈플러스 영수증의 엑셀파일입니다.`, // 마트, 시트포멧
            // text: 'www.recipto.com',
            html: '<strong>www.receipto.com</strong>',
            attachments
        }
        let result
        await this.sgMail
            .send(msg)
            .then((res) => {
                // console.log('Email sent')
                result = {'Email sent': res}
            })
            .catch((error) => {
                console.error('Email sent ERROR: ', error)
                result = {"Email sent ERROR": error}
            })
        return result
    };

    /**
     * 
     */
     async annotateImage(image: Express.Multer.File) {
        const request = {
            "image": {
                "content": image.buffer.toString('base64')
            },
            "features": [
                {"type": "TEXT_DETECTION"},
                {"type": "DOCUMENT_TEXT_DETECTION"},
                {"type": "CROP_HINTS"},
                // {"type": "LOGO_DETECTION"},
            ]
        };
        let result
        await this.imageAnnotatorClient.annotateImage(request)
            .then(results => {
                // console.log(results);
                result = results
            })
            .catch(err => {
                console.error('annotateImage ERROR:', err);
                result = err
            });
        return result
    };

    // ------------------------- lab 모듈로 분리하기 -------------------------
    // 중복 기능이나 과정,절차들을 분리,재사용하도록 칼질하기

    /**
     * 더이상 사용하지 않음
     */
    // async sendGoogleVisionAnnotateResultToLabs(reciptImage: Express.Multer.File, multipartBody: MultipartBodyDto) {
        
    //     const {receiptStyle, labsReceiptNumber} = multipartBody;
    //     if (!receiptStyle || !labsReceiptNumber) {
    //         throw new BadRequestException('receiptStyle or labsReceiptNumber is not available')
    //     }
    //     const annotateResult = await this.annotateImage(reciptImage);

    //     let data = "export = " + JSON.stringify(annotateResult, null, 4);
    //     writeFile(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${labsReceiptNumber}.ts`, data, () => { console.log("WRITED: an annotateResult file"); });

    //     data = "export = " + JSON.stringify(multipartBody, null, 4);
    //     writeFile(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${labsReceiptNumber}-body.ts`, data, () => { console.log("WRITED: a multipartBody file"); });
    // };

    /**
     * 
     */
    deleteImageInGCS(filename) {
        return this.googleCloudStorage.bucket(this.bucketName).file(filename).delete()
    };

    /**
     * 이미지uri 로 데이터베이스를 뒤져서 annoRes 와 요청 body(복원된) 를 파일로 저장한다.
     */
    async writeAnnoResByImageAddress(imageAddress: string) {
        const {provider, providerInput, annotate_responseId, outputRequests} = await this.receiptModel.findOne({imageAddress}, 'provider providerInput annotate_responseId outputRequests').exec()
        const {response: annoRes} = await this.annotateResponseModel.findById(annotate_responseId, 'response').exec()
        
        const reqBody = {
            emailAddress: provider.emailAddress,
            sheetFormat: outputRequests[0].sheetFormat,
            receiptStyle: providerInput.receiptStyle? providerInput.receiptStyle : 'notProvided',
        }

        const imageUriFilePath = uriPathConverter.toPath(imageAddress)

        let data = "export = " + JSON.stringify(annoRes, null, 4);
        writeFile(`src/googleVisionAnnoLab/annotateResult/${reqBody.receiptStyle}/${imageUriFilePath}.ts`, data)
        .then(() => { console.log("WRITED: an annotateResult file"); })
        .catch(err => { console.log("WRITE ERROR: ", err); });

        data = "export = " + JSON.stringify(reqBody, null, 4);
        writeFile(`src/googleVisionAnnoLab/annotateResult/${reqBody.receiptStyle}/${imageUriFilePath}-body.ts`, data)
        .then(() => { console.log("WRITED: a multipartBody file"); })
        .catch(err => { console.log("WRITE ERROR: ", err); });
    };

    /**
     * #### DB 의 모든 영수증 객체들을 로컬 LAB 에 EXPECTED 로 만든다.
     * - 이미 파일로 존재히는 이미지URI 라면 다운로드하지 않는다. (=기존의 것이 변경될수는 없다)
     */
    async downloadReceiptsToExpected() {
        // 스타일 목록
        const receiptStyles = await readdir('src/googleVisionAnnoLab/expectReceipt/')

        // 필터만들기
        // 스타일 별로 and 필터로 로컬 expected 에 없는것만 필터링하고 각각을 or 필터로 묶음
        let filterOr = []
        for (const receiptStyle of receiptStyles) {
            let imageAddArr = await readdir(`src/googleVisionAnnoLab/expectReceipt/${receiptStyle}`)
            imageAddArr = imageAddArr.map((fileName) => {
                return uriPathConverter.toUri(fileName).slice(0, -3)
            });
            filterOr.push({$and: [{'providerInput.receiptStyle': receiptStyle},{imageAddress: {$nin: imageAddArr}}]},)
        };
        
        // 로컬 expected 에 없는 영수증만 가져옴
        const receipts = await this.receiptModel.find({$or: filterOr}, "providerInput imageAddress itemArray readFromReceipt").exec()

        if (receipts.length === 0) {
            return 'No new receipt to download to expected'
        };

        // expected 생성
        const pathArr = []
        const writeFilePromiseArr = receipts.map((receipt) => {
            const imageUriFilePath = uriPathConverter.toPath(receipt.imageAddress)
            const data = "export = " + JSON.stringify(receipt, null, 4);
            return writeFile(`src/googleVisionAnnoLab/expectReceipt/${receipt.providerInput.receiptStyle}/${imageUriFilePath}.ts`, data)
            .then(() => {
                pathArr.push(`${receipt.providerInput.receiptStyle}/${receipt.imageAddress}`)
                return
            })
            .catch(err => { console.log("WRITE ERROR: ", err); });
        });

        await Promise.all(writeFilePromiseArr);
        return {
            path: pathArr,
            count: pathArr.length
        };
    };

    /**
     * #### 입력된 Version 의 get 으로 DB 에서 TEST
     * - 기존에 failures 없던것 : 문제 생기는지 탐색
     * - 기존에 failures 있던것 : 새로이 해결된 경우가 있어야함 (그것들은 후에 따로 처리(expected 업데이트해주기)해야함)
     * 
     * - 에러핸들링 손보기
     * 
     * #### response
     * - failures 없던것(noFailureImages) 성공 몇개, 문제발생 몇개, 문제발생이미지주소배열
     * - failures 있던것(failureImages) 문제있음 몇개, 문제제거 몇개, 문제제거이미지주소배열
     * - 문제발생(newFailureImages)들의 {imageAddress, permits, receipt차이점, failures} 나열
     * - 문제제거(newSuccessImages)들의 {imageAddress, permits, receipt, expected, failures} 나열
     */
    async testGetOnDB(getVersion: string) {
        // get 가져오기
        const testGet = this.loadGet(getVersion);

        // failAnnoResIdArr 만들기
        const readFailureArr = await this.readFailureModel.find({}, 'annotate_responseId permits imageAddress').exec()
        const failAnnoResIdArr = readFailureArr.map((readFailure) => {
            return readFailure.annotate_responseId
        });
        
        // response
        const testOn = {total: 0, noFailures: 0, failures: 0}
        const noFailureImages = {success: 0, newFailure: 0}
        const failureImages = {failure: 0, failureDetail: {permitChange: 0}, newSuccess: 0}
        const detail = {
            newFailureImageAddresses: [],
            newFailures: [],
            newSuccessImageAddresses: [],
            newSuccesses: [],
            failuresWithPermitChangeImageAddresses: [],
            failuresWithPermitChange: []
        }

        // annoRes 가져오는거 너무 오래걸림!!
        const annoResNoFailuresArr = await this.annotateResponseModel.find({_id: {$nin: failAnnoResIdArr}}, 'imageAddress response').exec();
        const annoResFailuresArr = await this.annotateResponseModel.find({_id: {$in: failAnnoResIdArr}}, 'imageAddress response').exec();

        // testOn
        testOn.total = annoResNoFailuresArr.length + annoResFailuresArr.length
        testOn.noFailures = annoResNoFailuresArr.length
        testOn.failures = annoResFailuresArr.length

        await Promise.all([
            // 기존에 failures 없던것 (noFailureImages)
            await annoResNoFailuresArr.reduce(async (acc, annoRes) => {
                const {provider, providerInput} = await this.receiptModel.findOne({imageAddress: annoRes.imageAddress}, 'provider providerInput').exec();
                const {receipt, failures, permits} = testGet(annoRes.response, {emailAddress: provider.emailAddress, receiptStyle: providerInput.receiptStyle}, annoRes.imageAddress);
                
                // receipt 차이점 있으면 or failures 있으면 or permits 에 false 있으면 newFailure 에 추가
                const expected = JSON.parse((await readFile(`src/googleVisionAnnoLab/expectReceipt/${providerInput.receiptStyle}/${uriPathConverter.toPath(annoRes.imageAddress)}.ts`, 'utf8')).slice(9));
                const difference = this.compareReceiptToExpected(
                    receipt,
                    expected
                );
                const newFailureTest = (() => {
                    if (difference.length > 0) {
                        return true
                    };
                    if (failures.length > 0) {
                        return true
                    };
                    let permitTest = true;
                    for (const permit in permits) {
                        if (permits[permit] === false) {
                            permitTest = false
                            break
                        };
                    };
                    if (!permitTest) {
                        return true
                    };
                    return false
                })();

                await acc;
                return new Promise(async (resolve, reject) => {
                    try {
                        if (newFailureTest) {
                            noFailureImages.newFailure++
                            detail.newFailureImageAddresses.push(annoRes.imageAddress)
                            detail.newFailures.push({imageAddress: annoRes.imageAddress, permits, failures, difference})
                            resolve()
                        } else {
                            noFailureImages.success++
                            resolve()
                        };
                    } catch (err) {
                        reject(err.stack)
                    };
                });
            }, Promise.resolve()),

            // 기존에 failures 있던것 (failureImages)
            await annoResFailuresArr.reduce(async (acc, annoRes) => {
                const {provider, providerInput} = await this.receiptModel.findOne({imageAddress: annoRes.imageAddress}, 'provider providerInput').exec();
                const {receipt, failures, permits} = testGet(annoRes.response, {emailAddress: provider.emailAddress, receiptStyle: providerInput.receiptStyle}, annoRes.imageAddress);

                // permits 에 false 없고, failures 도 없으면 newSuccess 에 추가
                let newSuccessTest = false
                if (failures.length === 0) {
                    let permitTest = true;
                    for (const permit in permits) {
                        if (permits[permit] === false) {
                            permitTest = false
                            break
                        };
                    };
                    if (permitTest) {
                        newSuccessTest = true
                    };
                };

                let difference
                if (newSuccessTest) {
                    const expected = JSON.parse((await readFile(`src/googleVisionAnnoLab/expectReceipt/${providerInput.receiptStyle}/${uriPathConverter.toPath(annoRes.imageAddress)}.ts`, 'utf8')).slice(9));
                    difference = this.compareReceiptToExpected(
                        receipt,
                        expected
                    );
                };

                await acc;
                return new Promise(async (resolve, reject) => {
                    try {
                        if (newSuccessTest) {
                            failureImages.newSuccess++
                            detail.newSuccessImageAddresses.push(annoRes.imageAddress)
                            detail.newSuccesses.push({imageAddress: annoRes.imageAddress, difference})
                            resolve()
                        } else {
                            // permits 비교하고 다르면 permitsDifference 생성
                            const prevPermits = readFailureArr.find((readFailure) => {
                                return readFailure.imageAddress === annoRes.imageAddress
                            }).permits
                            const permitsKeyArr = ['items', 'receiptInfo', 'shopInfo', 'taxSummary'/*, 'amountSummary'*/]
                            for (const permitsKey of permitsKeyArr) {
                                const prev = prevPermits[permitsKey] === undefined ? false : prevPermits[permitsKey]
                                const now = permits[permitsKey] === undefined ? false : permits[permitsKey]
                                if (prev !== now) {
                                    failureImages.failureDetail.permitChange++
                                    detail.failuresWithPermitChangeImageAddresses.push(annoRes.imageAddress)
                                    detail.failuresWithPermitChange.push({imageAddress: annoRes.imageAddress, prevPermits, testPermits: permits});
                                    break;
                                };
                            };
                            failureImages.failure++
                            resolve()
                        };
                    } catch (err) {
                        reject(err.stack)
                    };
                });
            }, Promise.resolve())
        ]).catch((err) => {
            throw new InternalServerErrorException(err);
        });

        return {testOn, noFailureImages, failureImages, detail}
    };

    /**
     * #### getVersion 의 Get 으로 imageAddresses 들로 DB 에서 AnnoRes 받아와서 Expected 로컬에 쓰기
     * 
     * - 에러핸들링 손보기
     */
    async overwriteExpectedByGet(getVersion: string, imageAddresses: string[]) {
        const getReceipt = this.loadGet(getVersion);
        return await Promise.all(imageAddresses.map(async (imageAddress) => {
            const {provider, providerInput, annotate_responseId, outputRequests} = await this.receiptModel.findOne({imageAddress}, 'provider providerInput annotate_responseId outputRequests').exec();
            const {response: annoRes} = await this.annotateResponseModel.findById(annotate_responseId, 'response').exec();
            
            const reqBody = {
                emailAddress: provider.emailAddress,
                sheetFormat: outputRequests[0].sheetFormat,
                receiptStyle: providerInput.receiptStyle? providerInput.receiptStyle : 'notProvided',
            };

            const {receipt} = getReceipt(annoRes, reqBody, imageAddress);

            const data = "export = " + JSON.stringify(receipt, null, 4);
            return writeFile(`src/googleVisionAnnoLab/expectReceipt/${providerInput.receiptStyle}/${uriPathConverter.toPath(imageAddress)}.ts`, data, 'utf8');
        }))
        .then(() => { return 'success' })
        .catch((err) => { throw new InternalServerErrorException(err) });
    };

    /**
     * #### 새로운 GET 버젼에 맞게 전체 데이터베이스 업데이트
     * (전부 다 읽음) (로컬에서 새로운 get 버젼이 모든 데이터에 대해서 문제가 없는것을 확인 후에 실행할 것)
     * - 에러핸들링 추가하기
     * - 중복코드 손보기
     * 
     * - 새로 성공한것들중에 최신 output 요청이 실패했다면 같은 output 요청을 새로 생성하고 실행해보기
     * - readFailures 는 annoRes 모두 읽은 후에 한번에 처리. (만약 중간에 실패하면, 이메일 보낸 기록은 업데이트되야하지만 readFailures 는 이전버전의 상태로 남아있는게좋음)
     */
    async updateGet(getVersion: string) {
        const getReceipt = this.loadGet(getVersion);
        const annotate_responses = await this.annotateResponseModel.find().exec();
        const readFailuresSaveArray = [];
        await annotate_responses.reduce(async (acc, annotate_response) => {
            const oldReceipt = await this.receiptModel.findOne({imageAddress: annotate_response.imageAddress}).exec();
            const {receipt: newReceipt, failures: newFailures, permits: newPermits} = getReceipt(annotate_response.response, {emailAddress: oldReceipt.provider.emailAddress, receiptStyle: oldReceipt.providerInput.receiptStyle}, annotate_response.imageAddress);
            // permits.items 이 true 인데 최신 outputRequest 가 실패인 경우 새로운 outputRequest 생성하고 실행!
            if (!oldReceipt.outputRequests[oldReceipt.outputRequests.length-1].result['Email sent'] && newPermits.items) {
                newReceipt.addOutputRequest(new Date(), oldReceipt.outputRequests[oldReceipt.outputRequests.length-1].sheetFormat, oldReceipt.provider.emailAddress, 'devUpdated');
                await this.executeOutputRequest(newReceipt, newPermits);
                oldReceipt.outputRequests.push(newReceipt.outputRequests[0])
            };
            
            // receipt 업데이트
            oldReceipt.itemArray = newReceipt.itemArray;
            oldReceipt.readFromReceipt = newReceipt.readFromReceipt;
            await oldReceipt.save();

            await acc;
            return new Promise(async (resolve, reject) => {
                try {
                    if (newFailures.length > 0) {
                        readFailuresSaveArray.push([newFailures, newPermits, annotate_response.imageAddress, annotate_response._id, oldReceipt._id]);
                        resolve();
                    };
                    resolve();
                } catch (error) {
                    reject(error);
                };
            });
        }, Promise.resolve());

        // readFailures 날리기
        await this.readFailureModel.deleteMany({}).exec();

        // readFailures 저장
        await readFailuresSaveArray.reduce(async (acc, [newFailures, newPermits, imageAddress, annotate_response_id, receipt_id]) => {
            await acc;
            return this.saveFailures(newFailures, newPermits, imageAddress, annotate_response_id, receipt_id);
        }, Promise.resolve());
    };

    /**
     * #### getVersion 으로 Get 가져오기
     */
    loadGet(getVersion: string) {
        const get = receiptObject[`get_${getVersion}`]
        if (!get) {
            throw new BadRequestException('getVersion is not valid')
        };
        return get
    };

    /**
     * #### receipt vs expected
     * 
     * - 중복코드 제거
     */
    compareReceiptToExpected(receipt: Receipt, expected) {
        const difference = []
        // imageAddress 다르면 종료
        if (receipt.imageAddress !== expected.imageAddress) {
            difference.push({key: 'imageAddress', receipt: receipt.imageAddress, expected: expected.imageAddress})
            return difference;
        };

        // items 비교
        const receiptItemLength = receipt.itemArray.length
        const expectedItemLength = expected.itemArray.length
        if (receiptItemLength !== expectedItemLength) {
            difference.push({key: 'itemArray.length', receipt: receiptItemLength, expected: expectedItemLength})
        } else {
            receipt.itemArray.forEach((item, itemIdx) => {
                const itemReadFromReceiptKeyArr = ["productName", "taxExemption", "discountArray", "unitPrice", "quantity", "amount"]
                itemReadFromReceiptKeyArr.forEach((key) => {
                    if (key === 'discountArray') {
                        const receiptDiscountLength = item.readFromReceipt.discountArray.length
                        const expectedDiscountLength = expected.itemArray[itemIdx].readFromReceipt.discountArray.length
                        if (receiptDiscountLength !== expectedDiscountLength) {
                            difference.push({key: `itemArray[${itemIdx}].discountArray.length`, receipt: receiptDiscountLength, expected: expectedDiscountLength})
                        } else {
                            item.readFromReceipt[key].forEach((discount, discountIdx) => {
                                const discountReadFromReceiptKeyArr = ["name", "amount", "code"]
                                discountReadFromReceiptKeyArr.forEach((key) => {
                                    const receiptValue = discount[key]
                                    const expectedValue = expected.itemArray[itemIdx].readFromReceipt.discountArray[discountIdx][key]
                                    if (receiptValue !== undefined && expectedValue !== undefined) {
                                        if (receiptValue !== expectedValue) {
                                            difference.push({key: `itemArray[${itemIdx}].discountArray[${discountIdx}].${key}`, receipt: receiptValue, expected: expectedValue})
                                        };
                                    } else if (receiptValue === undefined && expectedValue !== undefined) {
                                        difference.push({key: `itemArray[${itemIdx}].discountArray[${discountIdx}].${key}`, receipt: undefined, expected: expectedValue})
                                    } else if (receiptValue !== undefined && expectedValue === undefined) {
                                        difference.push({key: `itemArray[${itemIdx}].discountArray[${discountIdx}].${key}`, receipt: receiptValue, expected: undefined})
                                    };
                                });
                            });
                        };
                    } else {
                        const receiptValue = item.readFromReceipt[key]
                        const expectedValue = expected.itemArray[itemIdx].readFromReceipt[key]
                        if (receiptValue !== undefined && expectedValue !== undefined) {
                            if (receiptValue !== expectedValue) {
                                difference.push({key: `itemArray[${itemIdx}].${key}`, receipt: receiptValue, expected: expectedValue})
                            };
                        } else if (receiptValue === undefined && expectedValue !== undefined) {
                            difference.push({key: `itemArray[${itemIdx}].${key}`, receipt: undefined, expected: expectedValue})
                        } else if (receiptValue !== undefined && expectedValue === undefined) {
                            difference.push({key: `itemArray[${itemIdx}].${key}`, receipt: receiptValue, expected: undefined})
                        };
                    };
                });
            });
        };

        // receiptReadFromReceipt 비교
        const receiptReadFromReceiptKeyArr = ["date", "name", "tel", "address", "owner", "businessNumber", "taxProductAmount", "taxAmount", "taxExemptionProductAmount"]
        receiptReadFromReceiptKeyArr.forEach((key) => {
            let receiptValue = receipt.readFromReceipt[key]
            let expectedValue = expected.readFromReceipt[key]
            if (key === 'date') {
                receiptValue = receiptValue.toString()
                expectedValue = !expectedValue? new Date(undefined).toString() : new Date(expectedValue).toString()
            }
            if (receiptValue !== undefined && expectedValue !== undefined) {
                if (receiptValue !== expectedValue) {
                    if (!Number.isNaN(receiptValue)) {
                        difference.push({key, receipt: receiptValue, expected: expectedValue})
                    }
                };
            } else if (receiptValue === undefined && expectedValue !== undefined) {
                difference.push({key, receipt: undefined, expected:expectedValue})
            } else if (receiptValue !== undefined && expectedValue === undefined) {
                difference.push({key, receipt: receiptValue, expected: undefined})
            };
        });

        return difference
    };
};
