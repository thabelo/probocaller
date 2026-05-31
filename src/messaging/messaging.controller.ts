import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneE164 } from '../common/validation/is-phone-e164';
import { MessagingService } from './messaging.service';

export class SendMessageDto {
  @ApiProperty({ example: '+27821234567', description: 'Recipient phone in E.164 format' })
  @IsString() @IsNotEmpty() @IsPhoneE164()
  recipientPhone: string;

  @ApiProperty({ example: 'Hey, are you free?', description: 'Message text' })
  @IsString() @IsNotEmpty() @MaxLength(4000)
  body: string;
}

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller()
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a message to a registered user by phone number' })
  send(@Request() req, @Body() dto: SendMessageDto) {
    return this.service.send(req.user.userId, dto.recipientPhone, dto.body);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List my conversations (main inbox + requests)' })
  list(@Request() req) {
    return this.service.listConversations(req.user.userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get the message thread for a conversation' })
  thread(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getMessages(req.user.userId, id);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark the other party\'s messages in a conversation as read' })
  read(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.markRead(req.user.userId, id);
  }
}
