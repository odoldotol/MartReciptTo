import { IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class MultipartBodyDto {
    
    @IsEmail()
    @IsNotEmpty()
    readonly emailAddress: string;
    
    @IsIn(["xlsx","csv"])
    readonly sheetFormat: string;

    @IsIn(['homeplus','emart','costco','lottemart'])
    readonly receiptStyle?: string;

    @IsOptional()
    @IsString()
    readonly labsReceiptNumber?: string;

    @IsOptional()
    readonly password: string; // 임시
};
