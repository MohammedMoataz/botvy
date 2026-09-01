import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Optional everywhere, on purpose. A chat started offline has to carry a
 * message before the sync that would have created it has drained, so an
 * unknown id is created rather than refused — and a client from before named
 * chats sends nothing, which files the message under coaching.
 */
const CONVERSATION_ID = {
  required: false,
  description:
    "The phone's own id for the thread. Created if the server has never seen it; omitted by older clients, whose messages go to the coaching chat.",
} as const;

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiProperty(CONVERSATION_ID)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  conversationId?: string;
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

  @ApiProperty(CONVERSATION_ID)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  conversationId?: string;
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
