import * as receiptObject from '../receiptObject';
import googleVisionAnnoInspectorPipe from '../receiptObject/googleVisionAnnoPipe/inspector.V0.0.1';
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

// // fullTextAnnotationPlusStudy 파일 쓰기
// const pipedAnnotateResult = googleVisionAnnoInspectorPipe(annotateResult);
// const data = "export = " + JSON.stringify(pipedAnnotateResult.fullTextAnnotationPlusStudy, null, 4);
// writeFile(`src/googleVisionAnnoLab/fullTextAnnotationPlusStudy/${receiptStyle}/${receiptNumber}.ts`, data, () => { console.log("WRITED: a fullTextAnnotationPlusStudy file", receiptNumber); });


const receipt = receiptObject.get_V0_2_1(annotateResult, multipartBody);

console.log(receipt);
