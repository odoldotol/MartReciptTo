import { google } from "@google-cloud/vision/build/protos/protos";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type Annotate_responseDocument = Annotate_response & Document;

@Schema({ timestamps: true })
export class Annotate_response {

    @Prop({
        type: String,
        required: true,
        unique: true
    })
    imageAddress: string;

    @Prop({
        type: Array<Object>, Object,
        required: true
    })
    response: [google.cloud.vision.v1.IAnnotateImageResponse] | object
}

export const Annotate_responseSchema = SchemaFactory.createForClass(Annotate_response);