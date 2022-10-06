// version 0.1.1

// 구굴 비젼 API 의 "TEXT_DETECTION", "DOCUMENT_TEXT_DETECTION" 기능을 포함한 annotateResult: [google.cloud.vision.v1.IAnnotateImageResponse] 로부터 데이터를 얻습니다.
// 인자 annotateResult 는 googleVisionAnnoPipe/inspector.V0.0.1 를 통해 검증되어야 합니다.
// Receipt Object Define Version = 0.1.1

// 영수증의 구조분석과 요소간 상대적 위치를 기준으로 텍스트요소들을 찾아내는 솔루션입니다.
// 홈플러스 단일 술루션입니다.

// get.V0.0.1 에서 출발했습니다.
/** 
 * 테스트영수증 커버리지
 * 
 * - 구매 목록 리스트
 * 홈플러스 : 1-7
 * 
 * - 맨위 Homplus 상표
 * 
 * - 맨위 지점명, 주소, 전화번호 등
 * 홈플러스 : 1-7
 * 
 * - ReceiptInfo (년/월/일/ 시[요일], (TM:, NO: 는 읽지만, 오타문제로 저장하지 않았음. 필요한 경우 해결하기))
 * 홈플러스 : 1-7
 * 
 * - 과세 부가세 면세 부분 (구매목록-상품명 에서 못읽은 면세품목 찾아낼 수 있을것같다!)
 * 
 * - 합계 할인 구매금액 부분 (영수증 객체안에 구매목록-총계 간 검증 매써드 넣기)
 * 
 * - 결제 부분
 * 
 * - 포인트 부분
 * 
 */

/** 제약적인 가정
 * 
 * 영수증은 전체가 보이게 하나의 사진으로 하나의 영수증만 전달되었음.
 * 영수증은 거의 수평으로 활영되었음. (대략 2도이내)
 * 상품명 단가 수량 금액 요소간의 y축 거리는 어떠한 다른 요소들과의 y축 거리보다 가까움.
 * 상품명 단가 수량 금액 요소들 모두 구글 비젼API가 오타없이 정확히 찾아냈음 (비록 오답인 요소가 함께 찾아졌을지라도).
 * 위에서 언급한 오답인 요소는 정답요소와 완전한 수평위치에 있을 수 없음.
 * "표시 상품은 부가세 면세품목입니다" | "과세물품" 를 정확히 하나만 찾아냈음.
 */

/** 한계
 * 
 * taxExemption 은 기대를 하지 말자.
 * 홈플러스의 부가세 면세품목을 감지하기위해서는 * 를 똑바로 감지해야하는데 이에대한 정확도에 문제가 있음.
 * 우선 * 이나 . 로 찾는건 처리를 하지만 그외 이상하게 찾거나 못찾는것은 그대로 방치중임
 * taxSummary 로 부터 어느정도 보정,정확도향상 기대됨
 */

import { MultipartBodyDto } from 'src/recipt-to-sheet/dto/multipartBody.dto';
import { Receipt } from './define.V0.1.1';
/**
 * 
 */
export = function(annotateResult: {textAnnotations, fullTextAnnotationPlusStudy, failures}, multipartBody: MultipartBodyDto, imageUri?: string): {receipt: Receipt, failures: any[], permits: {items, receiptInfo, shopInfo, taxSummary} } {
    
    const {textAnnotations, fullTextAnnotationPlusStudy, failures} = annotateResult;
    const {emailAddress, receiptStyle} = multipartBody

    //
    const permits = {
        items: true,
        receiptInfo: true,
        shopInfo: true,
        taxSummary: true
    }

    // 영수증 객체 생성! (여기 단계에서는 절대 실패하면 안됨)
    const receipt = new Receipt(
        emailAddress,
        imageUri? imageUri : null,
        receiptStyle? receiptStyle : null
    );

    // 영수증의 기울기나 상태에 따라 범위를 조절해야할 수도 있음. 일단은 고정솔루션으로 최대한 커버해보기
    let productNameRangeX,
        unitPriceRangeX,
        textAnnotationsRangeX,
        taxSummaryRangeX,
        itemRangeY,
        receiptInfoRangeY,
        shopInfoRangeY,
        taxSummaryRangeY,
        quantity,
        amount
    try {
        ({ // productNameGroup, unitPriceGroup 까지 찾을 준비 + ReceiptInfoGroup, ShopInfoGroup, TaxSummaryNumberGroup 까지 찾을 준비
            productNameRangeX,
            unitPriceRangeX,
            textAnnotationsRangeX,
            taxSummaryRangeX,
            itemRangeY,
            receiptInfoRangeY,
            shopInfoRangeY,
            taxSummaryRangeY,
            quantity,
            amount
            // 내부에서 독립적으로 결과물을 뱉도록 나눌 필요가 있음. 일단은 전부 실패거나 성공임.
        } = findItemRangeUntilUnitPrice(textAnnotations, fullTextAnnotationPlusStudy));

    } catch (error) {
        failures.push(error.stack)
        permits.items = false
        permits.receiptInfo = false
        permits.shopInfo = false
        permits.taxSummary = false
    };

    let productNameGroup,
        unitPriceGroup
    if (permits.items) {
        // 상품명, 단가 요소들을 모아놓은 배열을 만들고 y축에대해 정렬.
        try {
            productNameGroup = sortGroupAscByY(
                getFulltextAnnoObjByRange(
                    fullTextAnnotationPlusStudy,
                    productNameRangeX,
                    itemRangeY,
                    false
                )
            );
            unitPriceGroup = sortGroupAscByY(
                getFulltextAnnoObjByRange(
                    fullTextAnnotationPlusStudy,
                    unitPriceRangeX,
                    itemRangeY,
                    false,
                    {includeWords: true, word: 1}
                )
            );
        } catch (error) {
            failures.push(error.stack)
            permits.items = false
        };
    };

    // ReceiptInfoGroup
    let receiptInfoGroup
    try {
        receiptInfoGroup = getFulltextAnnoObjByRange(
            fullTextAnnotationPlusStudy,
            textAnnotationsRangeX,
            receiptInfoRangeY,
            false
        );
    } catch (error) {
        failures.push(error.stack)
        permits.receiptInfo = false
    };

    // ShopInfoGroup
    let shopInfoGroup
    try {
        shopInfoGroup = sortGroupAscByY(
            getFulltextAnnoObjByRange(
                fullTextAnnotationPlusStudy,
                textAnnotationsRangeX,
                shopInfoRangeY,
                false
            )
        );
    } catch (error) {
        failures.push(error.stack)
        permits.shopInfo = false
    };

    // TaxSummaryNumberGroup
    let taxSummaryNumberGroup
    try {
        taxSummaryNumberGroup = sortGroupAscByY(
            getFulltextAnnoObjByRange(
                fullTextAnnotationPlusStudy,
                taxSummaryRangeX,
                taxSummaryRangeY,
                false,
                {includeWords: true}
            )
        );
    } catch (error) {
        failures.push(error.stack)
        permits.taxSummary = false
    };

    if (permits.items) {
        try {
            const { // quantityGroup, amountGroup 찾을 준비
                quantityRangeX,
                amountRangeX
            } = findItemRangeQuantityAmount(textAnnotationsRangeX, quantity, amount, unitPriceGroup);

            // 수량, 금액 요소들을 모아놓은 배열을 만들고 y축에대해 정렬.
            const quantityGroup = sortGroupAscByY(
                getFulltextAnnoObjByRange(
                    fullTextAnnotationPlusStudy,
                    quantityRangeX,
                    itemRangeY,
                    true,
                    {includeSymbols: false}
                )
            );
            const amountGroup = sortGroupAscByY(
                getFulltextAnnoObjByRange(
                    fullTextAnnotationPlusStudy,
                    amountRangeX,
                    itemRangeY,
                    true,
                    {includeSymbols: false}
                )
            );
            
            // console.log('productNameGroup', productNameGroup);
            // console.log('unitPriceGroup', unitPriceGroup);
            // console.log('quantityGroup', quantityGroup);
            // console.log('amountGroup', amountGroup);
            // console.log('receiptInfoGroup', receiptInfoGroup);
            // console.log("TaxSummaryNumberGroup", TaxSummaryNumberGroup);
            
            // 상품명, 단가, 수량, 금액 요소들의 텍스트들을 행열에 맞춰 모두 같은 길이의 배열로 만들기.
            const textArrays = getTextArraysFromGroups(
                productNameGroup,
                unitPriceGroup,
                quantityGroup,
                amountGroup
            );
                
            /* 다듬기
            상품명: 숫자 두개로 시작하면 숫자 두개 제거, 공백으로 시작하거나 공백으로 끝나면 공백 제거
            나머지: 공백으로 시작하거나 공백으로 끝나면 공백 제거, 쉼표+숫자+숫자+숫자 발견시 쉼표 제거(그냥 모든쉼표 제거로 대체+포인트(.)로잘못찾는것도 제거) */
            const productNameArr = deleteSpacesEachEleOfFrontAndBackInArr(
                deleteStartingTwoNumbersEachEleInArr(textArrays.productNameArray)
            );
            const unitPriceArr = deleteAllNotNumberEachEleInArr(textArrays.unitPriceArray);
            const quantityArr = deleteAllNotNumberEachEleInArr(textArrays.quantityArray);
            const amountArr = deleteAllNotNumberEachEleInArr(textArrays.amountArray);
                
            // receipt.itemArray 완성
            receipt.readReceiptItems(productNameArr, unitPriceArr, quantityArr, amountArr);

        } catch (error) {
            failures.push(error.stack)
            permits.items = false
        };
    };
                    
    if (permits.receiptInfo) {
        try {
            // ReceiptInfoGroup에서 ReceiptInfo 추출하고 영수증 객체에 입력
            receipt.readReceiptInfo(getReceiptInfoFromGroup(receiptInfoGroup));
        } catch (error) {
            failures.push(error.stack)
            permits.receiptInfo = false
        };
    };

    if (permits.shopInfo) {
        try {
            // ShopInfoGroup에서 ShopInfo 추출하고 영수증 갹체에 입력
            receipt.readShopInfo(getShopInfoFromGroup(shopInfoGroup));
        } catch (error) {
            failures.push(error.stack)
            permits.shopInfo = false
        };
    };

    if (permits.taxSummary) {
        try {
            // TaxSummaryNumberGroup에서 TaxSummary 추출하고 영수증 객체에 입력
            receipt.readTaxSummary(getTaxSummaryFromGroup(taxSummaryNumberGroup, taxSummaryRangeY[2]));
        } catch (error) {
            failures.push(error.stack)
            permits.taxSummary = false
        };
    };

    if (permits.items) {
        receipt.complete();
    };

    // console.log('receipt', receipt);
    return {receipt, failures, permits};
};

/* -#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#-#- */

class idx {
    constructor(
        public pageIdx: number,
        public blockIdx?: number,
        public paragraphIdx?: number,
        public wordIdx?: number,
        public symbolIdx?: number,
    ) {}
};

/**
 * #### 정규표현식과 일치하는 요소 찾기 
 */
function getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, reg) {
    let result = []
    if (reg.test(fullTextAnnotationPlusStudy.text)) {
        let isInPage = false
        fullTextAnnotationPlusStudy.pages.forEach((page, pageIndex) => {
            if (reg.test(page.text)) {
                isInPage = true
                let isInBlock = false
                page.blocks.forEach((block, blockIndex) => {
                    if (reg.test(block.text)) {
                        isInBlock = true
                        let isInParagraph = false
                        block.paragraphs.forEach((paragraph, paragraphIndex) => {
                            if (reg.test(paragraph.text)) {
                                isInParagraph = true
                                let isInWord = false
                                paragraph.words.forEach((word, wordIndex) => {
                                    if (reg.test(word.text)) {
                                        isInWord = true
                                        let isInSymbol = false
                                        word.symbols.forEach((symbol, symbolIndex) => {
                                            if (reg.test(symbol.text)) {
                                                isInSymbol = true
                                                result.push([new idx(pageIndex, blockIndex, paragraphIndex, wordIndex, symbolIndex), symbol])
                                            }
                                        })
                                        // 모든 심볼에서 없으면?
                                        if (!isInSymbol) {
                                            result.push([new idx(pageIndex, blockIndex, paragraphIndex, wordIndex), word])
                                        }
                                    }
                                })
                                // 모든 단어에서 없으면?
                                if (!isInWord) {
                                    result.push([new idx(pageIndex, blockIndex, paragraphIndex), paragraph])
                                }
                            }
                        })
                        // 모든 구절에서 없으면?
                        if (!isInParagraph) {
                            result.push([new idx(pageIndex, blockIndex), block])
                        }
                    }
                })
                // 모든 블록에서 없으면?
                if (!isInBlock) {
                    result.push([new idx(pageIndex), page])
                }
            }
        })
        // 모든 페이지에서 없으면?
        if (!isInPage) {
            return [] // 임시
        }
    }
    else {
        return null
    }
    return result
};

/**
 * #### 영수증 위치해석 & 읽을 text 위치 결정 // 단가까지만 + ReceiptInfo
 * 
 * 1. 상품명 단가 수량 금액 라인 찾기.
 * 2. Item 하안선 기준요소 부분 찾기.
 * 3. 1,2 번에서 찾은걸로 y축 범위 결정하기.
 * 4. 상품명, 단가 가로축 범위 결정하기.
 */
function findItemRangeUntilUnitPrice(textAnnotations, fullTextAnnotationPlusStudy) {

    // 1. 상품명 단가 수량 금액 라인 찾기 // 오타로 못찾으면 오타로도 다 찾도록 추가해줘도됨. 오타가 나봐야 뭐
    const productName = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /상품명/)
    const unitPrice = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /단가/)
    const quantity = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /수량/)
    const amount = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /금액/)

    let productNameIndex: number;
    let unitPriceIndex: number;
    let quantityIndex: number;
    let amountIndex: number;

    let unitPriceAverageY: number;
    let quantityAverageY: number;
    
    // 상품명과 단가를 비교하여 세로축이 가장 인접한것 매칭
    let difference = 999;
    productName.forEach((productNameEle, productNameEleIdx) => {
        unitPrice.forEach((unitPriceEle, unitPriceEleIdx) => {
            const productNameEleAverageY = calAverageXorY(productNameEle, "y")
            const unitPriceEleAverageY = calAverageXorY(unitPriceEle, "y")
            const newDifference = Math.abs(productNameEleAverageY - unitPriceEleAverageY)
            if (newDifference < difference) {
                difference = newDifference
                productNameIndex = productNameEleIdx
                unitPriceIndex = unitPriceEleIdx
                unitPriceAverageY = unitPriceEleAverageY
            }
        })
    });

    // 단가를 기준으로 세로축방향으로 가장 인접한 수량 찾기
    difference = 999;
    quantity.forEach((quantityEle, quantityEleIdx) => {
        const quantityEleAverageY = calAverageXorY(quantityEle, "y")
        const newDifference = Math.abs(unitPriceAverageY - quantityEleAverageY)
        if (newDifference < difference) {
            difference = newDifference
            quantityIndex = quantityEleIdx
            quantityAverageY = quantityEleAverageY
        }
    });

    // 수량을 기준으로 세로축방향으로 가장 인접한 금액 찾기
    difference = 999;
    amount.forEach((amountEle, amountEleIdx) => {
        const amountEleAverageY = calAverageXorY(amountEle, "y")
        const newDifference = Math.abs(quantityAverageY - amountEleAverageY)
        if (newDifference < difference) {
            difference = newDifference
            amountIndex = amountEleIdx
        }
    });

    //
    const summaryYTopPin = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /총\s*합\s*계/)

    // 2. 아이템 y축 하안선 기준요소 찾기 (+부가세summary Y영역도)
    let itemYBottomPin = []
    let taxSummaryMaxY
    let taxSummaryStyle = 0 // (0: 과세물품, 부가세, 면세물품 / 1: 과세물품, 부가세 / 2: 면세물품) // 아마도 2번 형식도 있겠지? 일단은 0,1 만 커버하게 구현하고 2은 발견되면 추가할것임.
    const taxExemptionMsg = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /표시 상품은 부가세 면세품목입니다/)
    if (taxExemptionMsg === null) {
        itemYBottomPin = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /과\s*세\s*물\s*품/) // taxSummaryYTopPin // 여기사 못찾으면 2번 스타일
    }
    else {
        itemYBottomPin = taxExemptionMsg // taxSummaryYTopPin
    }

    // '면세물품'의 Y최대값이 taxSummary하안선 // y 걸쳐진것까지 포함 (word까지 continue포함 옵션줘서)
    let taxSummaryYBottomPin = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /면\s*세\s*물\s*품/)
    if (taxSummaryYBottomPin === null) {
        taxSummaryStyle = 1
        taxSummaryYBottomPin = getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /부\s*가\s*세/)
    }
    taxSummaryMaxY = Math.max(...getXorYArr(taxSummaryYBottomPin[0], "y"))

    // 3. 1,2 번에서 찾은걸로 y축 범위 결정하기
    const productNameYs = getXorYArr(productName[productNameIndex], "y")
    const unitPriceYs = getXorYArr(unitPrice[unitPriceIndex], "y")
    const quantityYs = getXorYArr(quantity[quantityIndex], "y")
    const amountYs = getXorYArr(amount[amountIndex], "y")
    const itemMinY = Math.max(...productNameYs, ...unitPriceYs, ...quantityYs, ...amountYs)
    // maxY 는 itemYBottomPin 의 y 값 중에서 2번째로 작은값 (대체적으로 수평인 다양한 기울기에서 이게 기하학적으로 제일 안전하다)
    const itemMaxY = getXorYArr(itemYBottomPin[0], "y")
    .sort((a, b) => a - b)[1]
    
    // receiptInfo Range 찾기
    const receiptInfoMaxY = Math.min(...productNameYs, ...unitPriceYs, ...quantityYs, ...amountYs)
    // receiptInfo TopPin 찾고 receiptInfo 의 MinY 찾기
    let receiptInfoMinY = 0
    // '[재매출 영수증]' 문구 찾기
    const receiptInfoTopPin = getFulltextAnnoObjByReg(
        fullTextAnnotationPlusStudy,
        /[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]{1}\s*[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{1}\s*[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{1}\s*[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{1}\s*[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{1}\s*[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{1}\s*[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{1}\s*[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]{1}\s+/
    )
    if (receiptInfoTopPin === null) { // 없으면 '단, 정상(미개봉)상품, 영수증/결제카드 지참' 찾기
        // 아래 각각 요소마다 찾아진 최소 Y중에서 가장 크면서 receiptInfoMaxY 보다는 작은 값 찾기
        [
            getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /단(?=[ ]정상|\W[ ]정상)/),
            getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /정상(?=[ ]미개봉|[ ]\W미개봉|\W미개봉|미개봉)/),
            getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /미개봉(?=[ ]상품|\W[ ]상품|\W상품|상품)/),
            getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /상품(?=[ ]영수증|\W[ ]영수증)/),
            getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /영수증(?=[ ]결제카드|\W결제카드|[ ]\W결제카드|\W[ ]결제카드|결제카드)/),
            getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /결제카드(?=[ ]지참|지참)/),
        ].forEach((ele) => {
            if (ele !== null) {
                const eleYs = ele.reduce((acc, cur) => {
                    acc.push(...getXorYArr(cur, "y"))
                    return acc
                }, [])
                const eleMinY = Math.max(...eleYs)
                if (eleMinY > receiptInfoMinY && eleMinY < receiptInfoMaxY) {
                    receiptInfoMinY = eleMinY
                }
            }
        })
    }
    else { // 찾았으면 Y의 평균값이 receiptInfoMinY
        receiptInfoMinY = calAverageXorY(receiptInfoTopPin[0], "y")
    }

    let shopInfoMaxY = receiptInfoMinY;
    // 아래 각각 요소의 배열마다 Y의 평균값(=>최대값)중 최소값을 구하고 그 최소값이 shopInfoMaxY 보다 작으면 shopInfoMaxY 에 할당
    // 위 평균값을 최대값으로 수정하면 쓸때없는게 간혹 포함되긴하는데 여기에서는 누락을 막는것만 신경쓰면 되서 괜찮음
    [
        getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /교환/),
        getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /환불/),
        getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /결제/),
        getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /변경/),
        getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /구매/),
        getFulltextAnnoObjByReg(fullTextAnnotationPlusStudy, /점포/),
    ].forEach((eleArr) => {
        if (eleArr !== null) {
            const eleArrMaxYs = eleArr.reduce((acc, cur) => {
                acc.push(Math.max(...getXorYArr(cur, "y")))
                return acc
            }, [])
            const eleArrMinY = Math.min(...eleArrMaxYs)
            if (eleArrMinY < shopInfoMaxY) {
                shopInfoMaxY = eleArrMinY
            }
        }
    })

    // 4. 상품명 단가 수량 금액들의 가로축 범위 결정하기
    const unitPriceMaxX = Math.max(...getXorYArr(unitPrice[unitPriceIndex], "x"))
    const textAnnotationsMinX = Math.min(...getXorYArr(textAnnotations[0], "x", true))
    const textAnnotationsMaxX = Math.max(...getXorYArr(textAnnotations[0], "x", true))
    const textAnnotationsMinY = Math.min(...getXorYArr(textAnnotations[0], "y", true))
    const textAnnotationsRangeX = [textAnnotationsMinX-1, textAnnotationsMaxX+1]
    const productNameRangeX = [textAnnotationsRangeX[0],unitPriceMaxX]
    const quantityMinX = Math.min(...getXorYArr(quantity[quantityIndex], "x"))
    const unitPriceRangeX = [unitPriceMaxX,quantityMinX]
    const itemRangeY = [itemMinY,itemMaxY]
    const receiptInfoRangeY = [receiptInfoMinY,receiptInfoMaxY]
    const shopInfoRangeY = [textAnnotationsMinY-1,shopInfoMaxY]
    const taxSummaryRangeY = [itemMaxY, taxSummaryMaxY, taxSummaryStyle]
    const taxSummaryRangeX = [Math.max(...getXorYArr(itemYBottomPin[0], "x")), textAnnotationsRangeX[1]]

    return {productNameRangeX, unitPriceRangeX, textAnnotationsRangeX, taxSummaryRangeX, itemRangeY, receiptInfoRangeY, shopInfoRangeY, taxSummaryRangeY, quantity:quantity[quantityIndex], amount:amount[amountIndex]}
};

/**
 * #### 영수증 위치해석 & 읽을 text 위치 결정 // 단가 이후
 * 
 * 1. 수량 금액 가로축 범위 결정하기.
 */
function findItemRangeQuantityAmount(textAnnotationsRangeX, quantity, amount, unitPriceGroup) {

    const unitPriceGroupMaxX = Math.max( // 단가 그룹의 맨위와 맨밑의 최대 x값
        Math.max(...getXorYArr(unitPriceGroup[0], "x")),
        Math.max(...getXorYArr(unitPriceGroup[unitPriceGroup.length-1], "x"))
    )
    const quantityMaxX = Math.max(...getXorYArr(quantity, "x"))
    const amountMinX = Math.min(...getXorYArr(amount, "x"))
    const quantityRangeX = [unitPriceGroupMaxX,(quantityMaxX+amountMinX)/2]
    const amountRangeX = [(quantityMaxX+amountMinX)/2,textAnnotationsRangeX[1]]

    return {quantityRangeX, amountRangeX}
};

function calAverageXorY(fullTextAnooObj, coordinate:"x"|"y") {
    return fullTextAnooObj[1].boundingBox.vertices.reduce((acc, cur) => acc + cur[coordinate], 0) / 4
};

function getXorYArr(AnnoObj, coordinate:"x"|"y", isTextAnno?) {
    if (isTextAnno === true) {
        return AnnoObj.boundingPoly.vertices.map((v) => v[coordinate])
    }
    else {
        return AnnoObj[1].boundingBox.vertices.map((v) => v[coordinate])
    }
};

/**
 * #### 완전 속해있으면 반환하고 걸쳐있으면 탐구하고 아예 안걸쳐있으면 패스하는 탐색
 * <주의> 페이지 1개인 경우만 고려되었음
 */
function getFulltextAnnoObjByRange(
    fullTextAnnotationPlusStudy,
    rangeX/*[overX, underX]*/,
    rangeY/*[overY, underY]*/,
    includeSymbols: boolean,
    continueOptions?/*{includeWords:boo, word:0|1, includeSymbols:boo, symbol:0|1}*/ // 0: x만 완전포함조건 1: y만 완전포함조건
) {
    let result = [];

    fullTextAnnotationPlusStudy.pages[0].blocks.forEach((block, blockIndex) => {
        const compare = compareVertices(block.boundingBox.vertices)
        if (compare[0] === true && compare[1] === true) {
            result.push([new idx(0, blockIndex), block])
        }
        else if (
            (compare[0] === "continue" || compare[1] === "continue") &&
            (compare[0] !== false && compare[1] !== false)
        ) {
            block.paragraphs.forEach((paragraph, paragraphIndex) => {
                const compare = compareVertices(paragraph.boundingBox.vertices)
                if (compare[0] === true && compare[1] === true) {
                    result.push([new idx(0, blockIndex, paragraphIndex), paragraph])
                }
                else if (
                    (compare[0] === "continue" || compare[1] === "continue") &&
                    (compare[0] !== false && compare[1] !== false)
                ) {
                    paragraph.words.forEach((word, wordIndex) => {
                        const compare = compareVertices(word.boundingBox.vertices)
                        if (compare[0] === true && compare[1] === true) {
                            result.push([new idx(0, blockIndex, paragraphIndex, wordIndex), word])
                        }
                        else if (
                            (compare[0] === "continue" || compare[1] === "continue") &&
                            (compare[0] !== false && compare[1] !== false)
                        ) {
                            if (includeSymbols) {
                                word.symbols.forEach((symbol, symbolIndex) => {
                                    const compare = compareVertices(symbol.boundingBox.vertices)
                                    if (compare[0] === true && compare[1] === true) {
                                        result.push([new idx(0, blockIndex, paragraphIndex, wordIndex, symbolIndex), symbol])
                                    }
                                    else if (
                                        continueOptions.includeSymbols &&
                                        (compare[0] === "continue" || compare[1] === "continue") &&
                                        (compare[0] !== false && compare[1] !== false)
                                    ) {
                                        if (continueOptions.symbol !== undefined) {
                                            if (compare[continueOptions.symbol] === true) {
                                                result.push([new idx(0, blockIndex, paragraphIndex, wordIndex, symbolIndex), symbol, 'continue'])
                                            }
                                        }
                                        else {
                                            result.push([new idx(0, blockIndex, paragraphIndex, wordIndex, symbolIndex), symbol, "continue"])
                                        }
                                    }
                                })
                            }
                            else if (continueOptions && continueOptions.includeWords) {
                                if (continueOptions.word !== undefined) {
                                    if (compare[continueOptions.word] === true) {
                                        result.push([new idx(0, blockIndex, paragraphIndex, wordIndex), word, "continue"])
                                    }
                                }
                                else {
                                    result.push([new idx(0, blockIndex, paragraphIndex, wordIndex), word, "continue"])
                                }
                            }
                        }
                    })
                }
            })
        }
    });
    return result;

    /**
     * 완전 속해있으면 true, 완전 분리되어있으면 false, 걸쳐있으면 "continue" 반환
 */
    function compareVertices(vertices) {
        const verticesX = []
        const verticesY = []
        vertices.forEach((vertex) => {
            verticesX.push(vertex.x)
            verticesY.push(vertex.y)
        })
        const maxX = Math.max(...verticesX)
        const minX = Math.min(...verticesX)
        const maxY = Math.max(...verticesY)
        const minY = Math.min(...verticesY)

        return [compareRange(minX, maxX, rangeX), compareRange(minY, maxY, rangeY)]

        function compareRange(min, max, range) {
            if ( // 완전 속해있음
                min > range[0] && max < range[1]
            ) {
                return true
            }
            else if ( // 완전 분리되어있음
                (min <= range[0] && max <= range[0]) || (max >= range[1] && min >= range[1])
            ) {
                return false
            }
            else {
                return "continue"
            }
        }
    };
};

/**
 * #### y축 기준 정렬
 */
function sortGroupAscByY(group) {
    return group.sort((a,b) => {
        const aVerticesY = a[1].boundingBox.vertices.map((v) => v.y)
        const bVerticesY = b[1].boundingBox.vertices.map((v) => v.y)
        return Math.min(...aVerticesY) - Math.min(...bVerticesY)
    })
};

/**
 * #### 각 그룹으로부터 텍스트배열을 만들어낸다.
 * 단, undefined 를 영수증의 빈곳에 잘 넣어주기만 하면 된다.
 * 
 * 상품명이 아래와 같을때 해당칼럽과 열에 빈곳이 존재한다.
 * * 행사할인 : 단가, 수량.
 * * 카드할인 : 단가, 수량.
 * * 쿠폰할인 : 수량.
 */
function getTextArraysFromGroups(productNameGroup, unitPriceGroup, quantityGroup, amountGroup) {

    // 각 Group 순회하며 Arr 만들기 (\n 기준으로 split 해서 배열로 만들어준다.)
    const productNameArray = makeProductNameArrFromGroup(productNameGroup);
    const unitPriceArray = makeArrFromGroup(unitPriceGroup);
    const quantityArray = makeArrFromGroup(quantityGroup);
    const amountArray = makeAmountArrFromGroup(amountGroup);

    // 상품명 arr 에서 특정상품명이 발견되는 index 로 단가 수량 arr 에 undefined 삽입
    productNameArray.forEach((productName, index) => {
        if (productName.includes("행사할인")) {
            unitPriceArray.splice(index, 0, undefined);
            quantityArray.splice(index, 0, undefined);
        }
        else if (productName.includes("쿠폰할인")) {
            quantityArray.splice(index, 0, undefined);
        }
        else if (productName.includes("카드할인")) {
            unitPriceArray.splice(index, 0, undefined);
            quantityArray.splice(index, 0, undefined);
        }
    })

    // console.log(productNameArray)
    // console.log(unitPriceArray)
    // console.log(quantityArray)
    // console.log(amountArray)

    // 4개의 배열의 길이가 모두 같으면 정상임. 정상이면 완성된 배열들 리턴
    if (
        productNameArray.length === unitPriceArray.length &&
        unitPriceArray.length === quantityArray.length &&
        quantityArray.length === amountArray.length
    ) {
        return {productNameArray, unitPriceArray, quantityArray, amountArray};
    }
    else {
        throw new Error("Failed to make textArrays : length of arrays are not same.")
    }

    /**
     * 기본적인 범용 툴
     */
    function makeArrFromGroup(group) {
        let arr = []
        group.forEach((item) => {
            item[1].text.split('\n').forEach((text) => {
                if (text !== '') {
                    arr.push(text)
                }
            })
        })
        return arr
    };

    /**
     * 상품명 전용 툴
     * 
     * - 하나의 아이템으로 찾아야할것을 word level 로 쪼개져 찾을경우 솔루션
     * - 시작 문자열이 두자리 숫자이거나 특정메시지가 포함됬을경우만 하나의 열로 인식하도록 함
     * - 할인정보 항목이 상품명 항목과 이어붙는 경우 핸들링
     * 
     * 중복코드 정리 필요
     */
    function makeProductNameArrFromGroup(group) {
        // 그룹 요소중에 word level 로 쪼개서 찾아진내용은 순서대로 이어붙인다음 \n 검사해야함.
        let arr = []
        let wordToParagraph = [] // disorderly 등장하는 word 를 재대로 이어붙이기위해 인덱스별 배열에 담아줌
        let tempPageIdx = NaN
        let tempBlockIdx = NaN
        let tempParagraphIdx = NaN
        group.forEach((item) => {
            const {pageIdx, blockIdx, paragraphIdx, wordIdx} = item[0]
            if (wordIdx !== undefined) { // word level 로 쪼개져 찾아진내용이면
                if (tempPageIdx === pageIdx && tempBlockIdx === blockIdx && tempParagraphIdx === paragraphIdx) {
                    wordToParagraph[wordIdx] = item[1].text
                }
                else { // 이어서 새로운 paragraph 의 word 나열이 시작되면
                    if (wordToParagraph.length > 0) {
                        wordToParagraph.join('').split('\n').forEach((text) => {
                            if (text !== '') {
                                if (/^[0-9]{2}/.test(text) || text.includes("행사할인") || text.includes("쿠폰할인") || text.includes("카드할인")) {
                                    if (/^[0-9]{2}/.test(text) && /쿠폰할인+$|행사할인+$/.test(text)) {
                                        arr.push(text.slice(0, text.length-4))
                                        arr.push(text.slice(text.length-4))
                                    }
                                    else {
                                        arr.push(text)
                                    }
                                }
                                else {
                                    arr[arr.length-1] += text
                                }
                            }
                        })
                        wordToParagraph = []
                    }
                    wordToParagraph[wordIdx] = item[1].text
                    tempPageIdx = pageIdx
                    tempBlockIdx = blockIdx
                    tempParagraphIdx = paragraphIdx
                }
            }
            else { // 정상 paragraph level 로 찾아진내용이면
                if (wordToParagraph.length > 0) { // 이전에 word level 로 쪼개져 찾아진내용이 있으면 처리하고 진행
                    wordToParagraph.join('').split('\n').forEach((text) => {
                        if (text !== '') {
                            if (/^[0-9]{2}/.test(text) || text.includes("행사할인") || text.includes("쿠폰할인") || text.includes("카드할인")) {
                                if (/^[0-9]{2}/.test(text) && /쿠폰할인+$|행사할인+$/.test(text)) {
                                    arr.push(text.slice(0, text.length-4))
                                    arr.push(text.slice(text.length-4))
                                }
                                else {
                                    arr.push(text)
                                }
                            }
                            else {
                                arr[arr.length-1] += text
                            }
                        }
                    })
                    wordToParagraph = []
                }
                item[1].text.split('\n').forEach((text) => {
                    if (text !== '') {
                        if (/^[0-9]{2}/.test(text) || text.includes("행사할인") || text.includes("쿠폰할인") || text.includes("카드할인")) {
                            if (/^[0-9]{2}/.test(text) && /쿠폰할인+$|행사할인+$/.test(text)) {
                                arr.push(text.slice(0, text.length-4))
                                arr.push(text.slice(text.length-4))
                            }
                            else {
                                arr.push(text)
                            }
                        }
                        else {
                            arr[arr.length-1] += text
                        }
                    }
                })
            };
        })
        if (wordToParagraph.length > 0) {
            wordToParagraph.join('').split('\n').forEach((text) => {
                if (text !== '') {
                    if (/^[0-9]{2}/.test(text) || text.includes("행사할인") || text.includes("쿠폰할인") || text.includes("카드할인")) {
                        if (/^[0-9]{2}/.test(text) && /쿠폰할인+$|행사할인+$/.test(text)) {
                            arr.push(text.slice(0, text.length-4))
                            arr.push(text.slice(text.length-4))
                        }
                        else {
                            arr.push(text)
                        }
                    }
                    else {
                        arr[arr.length-1] += text
                    }
                }
            })
            wordToParagraph = []
        }
        return arr
    };

    /**
     * amount 전용 툴
     * 
     * - symbol 레벨로 쪼개져 찾는경우 솔루션
     * - 중복 코드 제거하기
     */
    function makeAmountArrFromGroup(group) {
        let arr = []
        let symbolToWord = []
        let tempPageIdx = NaN
        let tempBlockIdx = NaN
        let tempParagraphIdx = NaN
        let tempWordIdx = NaN
        group.forEach((item) => {
            const {pageIdx, blockIdx, paragraphIdx, wordIdx, symbolIdx} = item[0]
            if (symbolIdx !== undefined) {
                if (tempPageIdx === pageIdx && tempBlockIdx === blockIdx && tempParagraphIdx === paragraphIdx && tempWordIdx === wordIdx) {
                    symbolToWord[symbolIdx] = item[1].text
                }
                else {
                    if (symbolToWord.length > 0) {
                        symbolToWord.join('').split('\n').forEach((text) => {
                            if (text !== '') {
                                arr.push(text)
                            }
                        })
                        symbolToWord = []
                    }
                    symbolToWord[symbolIdx] = item[1].text
                    tempPageIdx = pageIdx
                    tempBlockIdx = blockIdx
                    tempParagraphIdx = paragraphIdx
                    tempWordIdx = wordIdx
                }
            }
            else {
                if (symbolToWord.length > 0) {
                    symbolToWord.join('').split('\n').forEach((text) => {
                        if (text !== '') {
                            arr.push(text)
                        }
                    })
                    symbolToWord = []
                }
                item[1].text.split('\n').forEach((text) => {
                    if (text !== '') {
                        arr.push(text)
                    }
                })
            }
        })
        if (symbolToWord.length > 0) {
            symbolToWord.join('').split('\n').forEach((text) => {
                if (text !== '') {
                    arr.push(text)
                }
            })
            symbolToWord = []
        }
        return arr
    };
};

/**
 * #### 인자로 받은 배열의 요소가 숫자 두개로 시작하면 그 숫자 두개를 제거
 */
function deleteStartingTwoNumbersEachEleInArr(arr) {
    return arr.map((ele) => {
        return ele.replace(/^[0-9]{2}/, '')
    })
};

/**
 * #### 인자로 받은 배열의 요소가 공백으로 시작하거나 공백으로 끝나면 그 공백을 모두 제거
 */
function deleteSpacesEachEleOfFrontAndBackInArr(arr) {
    return arr.map((ele) => {
        if (ele === undefined) {
            return undefined
        }
        return ele.replace(/^[ ]+|[ ]+$/g, '')
    })
};

/**
 * #### 인자로 받은 배열의 요소에 모든쉼표를 제거
 * 
 * - 쉼표를 포인트(.)로 찾아버린것 제거
 */
function deleteAllCommaEachEleInArr(arr) {
    return arr.map((ele) => {
        if (ele === undefined) {
            return undefined
        }
        return ele.replace(/,|\./g, '')
    })
};

/**
 * #### 인자로 받은 배열의 요소에 숫자가 아닌 모든것을 제거
 * 
 * - '-' 는 살려야함
 */
function deleteAllNotNumberEachEleInArr(arr) {
    return arr.map((ele) => {
        if (ele === undefined) {
            return undefined
        }
        return ele.replace(/[^0-9-]/g, '')
    })
};

/**
 * #### 영수증 정보(시간, TM, NO) 찾기
 * 
 * 일단은 시간정보만 처리함
 */
function getReceiptInfoFromGroup(receiptInfoGroup) {
    let date = null
    let time = null
    // let tm = null
    // let no = null
    for(let i=0; i<receiptInfoGroup.length; i++) {
        if (date === null) {
            date = /\d{4}[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d{1,2}[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d{2}/.exec(receiptInfoGroup[i][1].text)
        }
        if (time === null) {
            time = /(?<!\d)\d{2}[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d{2}[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d{2}/.exec(receiptInfoGroup[i][1].text)
        }
        // if (tm === null) {
        //     tm = /TM[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d+/.exec(receiptInfoGroup[i][1].text)
        // }
        // if (no === null) {
        //     no = /NO[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d+/.exec(receiptInfoGroup[i][1].text)
        // }
        if (date !== null && time !== null/* && tm !== null && no !== null*/) {
            break
        }
    }
    const receiptDate = new Date(date[0]+" "+time[0])
    // const receiptTm = tm[0].slice(3)
    // const receiptNo = no[0].slice(3)
    return {receiptDate/*, receiptTm, receiptNo*/}
}

/**
 * #### Shop 정보(지점, 전화번호, 주소 ...) 찾기
 * 
 * 
 */
function getShopInfoFromGroup(group) {
    const shopInfoSentenceArr = getSentenceArrFromGroup(group)
    let name
    let tel
    let address
    let owner
    let businessNumber
    shopInfoSentenceArr.forEach((ele)=>{
        const testName = /(?<=홈플러스).*/.exec(ele)
        const testTel = /(?<=Tel.*)\d{3}[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d{3,4}[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]\d{4}/.exec(ele)
        const testOwner = /(?<=[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"\d]{5}\s*)[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/.exec(ele)
        if (testName !== null) {
            name = testName[0].replace(/^\s|\s$/g, '')
        }
        if (testTel !== null) {
            tel = testTel[0]
        }
        if (testOwner !== null) {
            owner = testOwner[0]
            const businessNumberReg = new RegExp('[0-9-<=.,;:*~^-_+<>=]{10,20}')
            businessNumber = businessNumberReg.exec(ele)[0]
        }
        else {
            if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{2,3}시/.test(ele) || /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]{1,10}로/.test(ele) || /\d{1,3}번길/.test(ele)) {
                address = ele.replace(/^\s|\s$/g, '')
            }
        }
    })
    return {name, tel, address, owner, businessNumber}
};

/**
 * 
 */
function getTaxSummaryFromGroup(group, style) {
    const taxSummarySentenceArr = deleteAllNotNumberEachEleInArr(getSentenceArrFromGroup(group))
    let result = {
        taxProductAmount: undefined,
        taxAmount: undefined,
        taxExemptionProductAmount: undefined
    }
    if (style === 2) {}
    else {
        result.taxProductAmount = taxSummarySentenceArr[0]
        result.taxAmount = taxSummarySentenceArr[1]
        result.taxExemptionProductAmount = taxSummarySentenceArr[2]
    }
    return result
}

/**
 * ####
 * 
 * - 반환하는 배열의 요소는 \n 으로 구분되거나 paragragh 가 바뀌는걸로 구분되는 하나의 sentence 이어야한다
 * - 그릅의 최소 레벨이 word 인 경우까지만 처리가능. (symbol 은 추후 구현 예정) -> 그릅 핸들링하는 범용툴로 전환해서 다른곳에 적용할 예정
 * - 중복코드재거해
 */
function getSentenceArrFromGroup(group) {
    let arr = [];
    let wordToParagraph = [];
    let tempPageIdx = NaN;
    let tempBlockIdx = NaN;
    let tempParagraphIdx = NaN;
    group.forEach((item) => {
        const {pageIdx, blockIdx, paragraphIdx, wordIdx} = item[0];
        if (wordIdx !== undefined) { // word 레벨 발견!
            if (tempPageIdx === pageIdx && tempBlockIdx === blockIdx && tempParagraphIdx === paragraphIdx) { // 탐구 진행중인 word
                wordToParagraph[wordIdx] = item[1].text;
            }
            else { // 처음시작이거나 새로운 paragraph 시작
                if (wordToParagraph.length > 0) { // 새로운 paragraph 시작인경우
                    wordToParagraph.join('').split('\n').forEach((text) => {
                        if (text !== '') {
                            arr.push(text);
                        };
                    });
                    wordToParagraph = [];
                }
                wordToParagraph[wordIdx] = item[1].text;
                tempPageIdx = pageIdx;
                tempBlockIdx = blockIdx;
                tempParagraphIdx = paragraphIdx;
            };
        }
        else { // word 레벨이 아닌경우
            if (wordToParagraph.length > 0) { // word 레벨 탐구 직후라면,
                wordToParagraph.join('').split('\n').forEach((text) => {
                    if (text !== '') {
                        arr.push(text);
                    };
                });
                wordToParagraph = [];
            };
            item[1].text.split('\n').forEach((text) => {
                if (text !== '') {
                    arr.push(text);
                };
            });
        };
    });
    if (wordToParagraph.length > 0) { // 마지막에 남은거 처리
        wordToParagraph.join('').split('\n').forEach((text) => {
            if (text !== '') {
                arr.push(text);
            };
        });
    };
    return arr
};