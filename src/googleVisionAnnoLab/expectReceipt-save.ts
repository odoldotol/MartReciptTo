import * as receiptObject from '../receiptObj';
import googleVisionAnnoInspectorPipe from '../receiptObj/googleVisionAnnoPipe/inspector.V0.0.1';
import { readFileSync, writeFile } from 'fs';
import uriPathConverter from '../util/uriPathConverter';
import imageUriArray from './homeplusUriArray';

/* ------------------------------------------------------------------ */
const receiptStyle = "homeplus"; //
const imageUriIndex = 0
const annoResNo = 0 // 쓸꺼아니면 falsy 로 두세요
/* ------------------------------------------------------------------ */

const receiptId = annoResNo? annoResNo : uriPathConverter.toPath(imageUriArray[imageUriIndex])

const annotateResult = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptId}.ts`, 'utf8').slice(9));

const multipartBody = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptId}-body.ts`, 'utf8').slice(9));

// 0.2.1 이전
/*
const {receipt} = getReceiptObject(
    googleVisionAnnoInspectorPipe(annotateResult),
    multipartBody
);
*/

const {receipt} = receiptObject.get_V0_2_1(
    annotateResult,
    multipartBody,
    imageUriArray[imageUriIndex]
);

const data = "export = " + JSON.stringify(receipt, null, 4);
writeFile(`src/googleVisionAnnoLab/expectReceipt/${receiptStyle}/${receiptId}.ts`, data, () => { console.log("WRITED: an expectReceipt file", receiptId); });
