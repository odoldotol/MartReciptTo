import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose from "mongoose";

export type Read_failureDocument = Read_failure & mongoose.Document;

@Schema({ timestamps: true })
export class Read_failure {
        
        @Prop({
            type: String,
            required: true,
            unique: true
        })
        imageAddress: string;
    
        @Prop({
            type: mongoose.Schema.Types.ObjectId, ref: 'annotate_response',
            required: true,
            unique: true
        })
        annotate_responseId: mongoose.Schema.Types.ObjectId

        @Prop({
            type: mongoose.Schema.Types.ObjectId, ref: 'receipt',
            required: true,
            unique: true
        })
        receiptId: mongoose.Schema.Types.ObjectId

        @Prop({
            type: Array<String>,
            required: true
        })
        failures: string[]

        @Prop({
            type: Object,
            required: true
        })
        permits: object
};

export const Read_failureSchema = SchemaFactory.createForClass(Read_failure);