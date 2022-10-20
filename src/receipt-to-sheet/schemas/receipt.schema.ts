import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose from "mongoose";
import { Provider, ReceiptItem, ReceiptReadFromReceipt, ProviderInput, OutputRequest } from "src/receiptObj/define.V0.1.1";

export type ReceiptDocument = Receipt & mongoose.Document;

@Schema({ timestamps: true })
export class Receipt {
    
    @Prop({ required: true })
    provider: Provider
    
    @Prop({ required: true })
    providerInput: ProviderInput

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
    
    @Prop()
    itemArray: ReceiptItem[]
    
    @Prop()
    readFromReceipt: ReceiptReadFromReceipt
    
    @Prop()
    outputRequests: OutputRequest[]
};

export const ReceiptSchema = SchemaFactory.createForClass(Receipt);