import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { User } from '../user/user.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
