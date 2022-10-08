import getReceiptObject from '../receiptObj/get.V0.2.1';
import googleVisionAnnoInspectorPipe from '../googleVisionAnnoPipe/inspector.V0.0.1';
import { readFileSync } from 'fs';
import uriPathConverter from '../util/uriPathConverter';
import imageUriArray from './homeplusUriArray';

/* ------------------------------------------------------------------ */
const receiptStyle = "homeplus"; //
/* ------------------------------------------------------------------ */

// const resultArray = []
// let resultMessageArray = [[],[],[]]

let receiptNumber = 1

while (true) {
    console.log("\n", receiptNumber)
    try {
        const annotateResult = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptNumber}.ts`, 'utf8').slice(9));
        const multipartBody = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptNumber}-body.ts`, 'utf8').slice(9));
        // const expectReceipt = JSON.parse(readFileSync(`src/googleVisionAnnoLab/expectReceipt/${receiptStyle}/${receiptNumber}.ts`, 'utf8').slice(9));

        const receiptObject = getReceiptObject(
            googleVisionAnnoInspectorPipe(annotateResult),
            multipartBody
        );

        // const expectResult = expect(receiptObject, expectReceipt)
        // // expect 만족하면
        // if (expectResult === true) {
        //     resultArray.push(receiptObject)
        //     console.log("PASS")
        //     resultMessageArray[0].push(`${receiptNumber}`)
        // }
        // else { // 만족 안하면
        //     resultArray.push({receiptObject, message: expectResult})
        //     console.log("FAIL: ", expectResult)
        //     resultMessageArray[0].push(`${receiptNumber}`)
        // }
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.log(e.message)
            console.log('-------- Test Break --------')
            break
        }
        // resultArray.push(e)
        console.log("ERROR: ", e.message)
        // resultMessageArray[0].push(`${receiptNumber}`)
    };
    receiptNumber += 1
};

let imageUriIndex = 0

while (true) {
    if (imageUriArray.length === imageUriIndex) {
        console.log('-------- Test Break --------')
        break
    }
    console.log("\n", imageUriIndex)
    try {
        const receiptId = uriPathConverter.toPath(imageUriArray[imageUriIndex])
        const annotateResult = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptId}.ts`, 'utf8').slice(9));
        const multipartBody = JSON.parse(readFileSync(`src/googleVisionAnnoLab/annotateResult/${receiptStyle}/${receiptId}-body.ts`, 'utf8').slice(9));
        const expectReceipt = JSON.parse(readFileSync(`src/googleVisionAnnoLab/expectReceipt/${receiptStyle}/${receiptId}.ts`, 'utf8').slice(9));

        const {receipt} = getReceiptObject(
            googleVisionAnnoInspectorPipe(annotateResult),
            multipartBody
        );

        // const expectResult = expect(receipt, expectReceipt)

        // // expect 만족하면
        // if (expectResult === true) {
        //     resultArray.push(receipt)
        //     console.log("PASS")
        //     resultMessageArray[0].push(imageUriIndex)
        // }
        // else { // 만족 안하면
        //     resultArray.push({receipt, message: expectResult})
        //     console.log("FAIL: ", expectResult)
        //     resultMessageArray[1].push(imageUriIndex)
        // }
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.log(e.message)
            console.log('-------- Test Break --------')
            break
        }
        // resultArray.push(e)
        console.log("ERROR: ", e.message)
        // resultMessageArray[2].push(imageUriIndex)
    };
    imageUriIndex += 1
};

// console.log("\n------- Test Summary -------")
// console.log("PASS  : ", `${resultMessageArray[0].length}`, resultMessageArray[0])
// console.log("FAIL  : ", `${resultMessageArray[1].length}`, resultMessageArray[1]) //
// console.log("ERROR : ", `${resultMessageArray[2].length}`, resultMessageArray[2])
// console.log("Total : ", `${resultMessageArray[0].length + resultMessageArray[1].length}`, "\n")

// function expect(receiptObject, expectReceipt) {
//     if (receiptObject.itemArray.length === expectReceipt.itemArray.length) {
//         let message = ''
//         receiptObject.itemArray.forEach((item, index) => {
//             const {productName, unuiPrice, quantity, amount} = item.readFromReceipt
//             const expectedProductName = expectReceipt.itemArray[index].readFromReceipt.productName
//             const expectedUnuiPrice = expectReceipt.itemArray[index].readFromReceipt.unuiPrice
//             const expectedQuantity = expectReceipt.itemArray[index].readFromReceipt.quantity
//             const expectedAmount = expectReceipt.itemArray[index].readFromReceipt.amount
//             if (productName !== expectedProductName) {
//                 message += `\nIdx:${index}, productName: ${productName}, expected: ${expectedProductName}`
//             }
//             if (unuiPrice !== expectedUnuiPrice) {
//                 message += `\nIdx:${index}, unuiPrice: ${unuiPrice}, expected: ${expectedUnuiPrice}`
//             }
//             if (quantity !== expectedQuantity) {
//                 message += `\nIdx:${index}, quantity: ${quantity}, expected: ${expectedQuantity}`
//             }
//             if (amount !== expectedAmount) {
//                 message += `\nIdx:${index}, amount: ${amount}, expected: ${expectedAmount}`
//             }
//             if (item.readFromReceipt.discountArray.length !== 0) {
//                 item.readFromReceipt.discountArray.forEach((discount, discountIndex) => {
//                     const {name, amount} = discount
//                     const expectedName = expectReceipt.itemArray[index].readFromReceipt.discountArray[discountIndex].name
//                     const expectedAmount = expectReceipt.itemArray[index].readFromReceipt.discountArray[discountIndex].amount
//                     if (name !== expectedName) {
//                         message += `\nIdx:${index}, discountIndex:${discountIndex}, discountName: ${name}, expected: ${expectedName}`
//                     }
//                     if (amount !== expectedAmount) {
//                         message += `\nIdx:${index}, discountIndex:${discountIndex}, discountAmount: ${amount}, expected: ${expectedAmount}`
//                     }
//                 })
//             }
//         })
//         if (message === '') {
//             return true
//         }
//         else {
//             return message
//         }
//     }
//     else {
//         return "itemArray.length is not equal"
//     }
// };
