import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import {Storage} from '@google-cloud/storage';
import credentials from '../../credential.json';
import sgMail from '@sendgrid/mail';
import { ConfigService } from '@nestjs/config';
import xlsx from 'xlsx'
import googleVisionAnnoInspectorPipe from '../receiptObject/googleVisionAnnoPipe/inspector.V0.0.1';
import * as receiptObject from '../receiptObject';
import { MultipartBodyDto } from './dto/multipartBody.dto';
import { v4 as uuidv4 } from 'uuid'
import { Receipt } from '../receiptObject/define.V0.1.1' // Receipt Version
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Receipt as ReceiptSchemaClass, ReceiptDocument } from './schemas/receipt.schema';
import { Annotate_response, Annotate_responseDocument } from './schemas/annotate_response.schema';
import { Read_failure, Read_failureDocument } from './schemas/read_failure.schema';
import convert from 'heic-convert';
import { google } from '@google-cloud/vision/build/protos/protos';
import annotateResponse from 'src/util/annotateResponse';

@Injectable()
export class ReciptToSheetService {

    private readonly imageAnnotatorClient = new ImageAnnotatorClient({credentials});
    private readonly sgMail
    readonly googleCloudStorage = new Storage({credentials});
    readonly bucketName: string
    private readonly getReceiptObject = receiptObject.get_V0_2_1 // Receipt Version

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(Annotate_response.name) private annotateResponseModel: Model<Annotate_responseDocument>,
        @InjectModel(ReceiptSchemaClass.name) private receiptModel: Model<ReceiptDocument>,
        @InjectModel(Read_failure.name) private readFailureModel: Model<Read_failureDocument>,
    ) {
        this.sgMail = sgMail.setApiKey(this.configService.get('SENDGRID_API_KEY'));

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
    };

    /**
     * FE
     */
    async processingReceiptImage(reciptImage: Express.Multer.File) { 
        // heic 형식일 경우 jpeg 로 변환 // 폰에서는 자동변환되는것같다?
        let buffer
        let mimetype: string
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
    async processingAnnoRes(annoRes: google.cloud.vision.v1.IAnnotateImageResponse[], imageUri: string, multipartBody: MultipartBodyDto, requestDate: Date) {

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
        receipt.addOutputRequest(requestDate, multipartBody.sheetFormat, multipartBody.emailAddress, "provided")

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
    async uploadImageToGCS(mimetype: string, buffer) {
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
            throw new InternalServerErrorException(error)
        };
    };

    /**
     * 
     */
    async saveAnnoRes(response: google.cloud.vision.v1.IAnnotateImageResponse[], imageAddress: string) {
        const newAnnotateResponse = new this.annotateResponseModel({
            imageAddress,
            response: annotateResponse.encoder(response)
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

    /**
     * 
     */
    deleteImageInGCS(filename) {
        return this.googleCloudStorage.bucket(this.bucketName).file(filename).delete()
    };
}
