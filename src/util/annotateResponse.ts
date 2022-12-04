import { google } from '@google-cloud/vision/build/protos/protos';

const AIR = google.cloud.vision.v1.AnnotateImageResponse;

export default {

    /**
     * 
     */
    encoder(annotateResponse/*: google.cloud.vision.v1.IAnnotateImageResponse[] */) {

        return annotateResponse.map((ele) => {
            ele = AIR.toObject(ele, {
                longs: String,
                enums: String,
                bytes: Array,
                defaults: true,
                arrays: true,
                objects: true,
                oneofs: true,
                json: true
            });
            const verify = AIR.verify(ele)
            if (verify === null) {
                return AIR.encodeDelimited(ele).finish();
            } else {
                throw new Error(verify);
            };
        });
    },

    /**
     * @param {Binary[]} encodedBinAnnotateResponse
     */
    decoder(encodedBinAnnotateResponse/*: Binary[]*/) {

        return encodedBinAnnotateResponse.map((ele) => {
            if (Buffer.isBuffer(ele.buffer)) {
                return AIR.toObject(AIR.decodeDelimited(ele.buffer), {
                    longs: String,
                    enums: String,
                    bytes: Array,
                    defaults: true,
                    arrays: true,
                    objects: true,
                    oneofs: true,
                    json: true
                });
            } else {
                throw new Error("Invalid encodedBinAnnotateResponse");
            };
        });
    },

};
