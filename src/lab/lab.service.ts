import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Receipt as ReceiptSchemaClass, ReceiptDocument } from '../receipt-to-sheet/schemas/receipt.schema';
import { Annotate_response, Annotate_responseDocument } from '../receipt-to-sheet/schemas/annotate_response.schema';
import { Read_failure, Read_failureDocument } from '../receipt-to-sheet/schemas/read_failure.schema';
import uriPathConverter from 'src/util/uriPathConverter';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import * as receiptObject from '../receiptObj';
import { Receipt } from 'src/receiptObj/define.V0.1.1'; // Receipt Version
import { ReciptToSheetService } from 'src/receipt-to-sheet/recipt-to-sheet.service';


@Injectable()
export class LabService {
    constructor(
        @InjectModel(Annotate_response.name) private annotateResponseModel: Model<Annotate_responseDocument>,
        @InjectModel(ReceiptSchemaClass.name) private receiptModel: Model<ReceiptDocument>,
        @InjectModel(Read_failure.name) private readFailureModel: Model<Read_failureDocument>,
        private readonly reciptToSheetService: ReciptToSheetService,
    ) {};

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

    // 중복 기능이나 과정,절차들을 분리,재사용하도록 칼질하기
    
    /**
     * #### readFailures 조회하기
     * - 필요시 갯수나 필터를 줄수있게 업뎃하면 좋겠다
     */
    async getReadFailures() {
        try {
            return await this.readFailureModel.find().exec()
        } catch (err) {
            throw new InternalServerErrorException(err)
        };
    };

    /**
     * #### receipt image
     */
    async downloadImage(imageFileName) {
        const options = {
            destination: "src/googleVisionAnnoLab/image/" + imageFileName,
        };
        try {
            await this.reciptToSheetService.googleCloudStorage.bucket(this.reciptToSheetService.bucketName).file(imageFileName).download(options);
        } catch (err) {
            throw new InternalServerErrorException(err)
        };
    };

    /**
     * #### 이미지uri 로 데이터베이스를 뒤져서 annoRes 와 요청 body(복원된) 를 파일로 저장한다.
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
                    } catch (err: any) {
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
                    } catch (err: any) {
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
                await this.reciptToSheetService.executeOutputRequest(newReceipt, newPermits);
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
            return this.reciptToSheetService.saveFailures(newFailures, newPermits, imageAddress, annotate_response_id, receipt_id);
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
}
