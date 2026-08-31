import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  message!: string;
}

export class QueuedMessageDto {
  @ApiProperty({ description: 'Client-generated id; a re-sent batch is deduplicated by it' })
  @IsString()
  @MinLength(1)
  clientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When the user actually typed it — relative times resolve against this',
  })
  @Type(() => Date)
  @IsDate()
  composedAt!: Date;
}

export class ChatBatchDto {
  @ApiProperty({ type: [QueuedMessageDto], description: 'Oldest first' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QueuedMessageDto)
  messages!: QueuedMessageDto[];
}
