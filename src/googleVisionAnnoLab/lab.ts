import getReceiptObject from '../receiptObj/get.V0.1.1';
import googleVisionAnnoInspectorPipe from '../googleVisionAnnoPipe/inspector.V0.0.1';
import { readFileSync, writeFile } from 'fs';
import uriPathConverter from '../util/uriPathConverter';

/* ------------------------------------------------------------------ */
const receiptStyle = "homeplus"; //
const imageUri = "gs://receipt-image-dev/5e02f4b5-54b7-4bfc-8c6c-846fa5520cec.jpeg"; // 초기 숫자 형식일 경우에는 number 타입으로 숫자 입력
/* ------------------------------------------------------------------ */

const receiptId = typeof(imageUri) === "number" ? imageUri : uriPathConverter.toPath(imageUri)

const annotateResult = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptId}.ts`, 'utf8').slice(9));
const multipartBody = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptId}-body.ts`, 'utf8').slice(9));

const pipedAnnotateResult = googleVisionAnnoInspectorPipe(annotateResult);

// // fullTextAnnotationPlusStudy 파일 쓰기
// const data = "export = " + JSON.stringify(pipedAnnotateResult.fullTextAnnotationPlusStudy, null, 4);
// writeFile(`src/googleVisionAnnoLab/fullTextAnnotationPlusStudy/${receiptStyle}/${receiptNumber}.ts`, data, () => { console.log("WRITED: a fullTextAnnotationPlusStudy file", receiptNumber); });


const receiptObject = getReceiptObject(pipedAnnotateResult, multipartBody);

console.log(receiptObject);
