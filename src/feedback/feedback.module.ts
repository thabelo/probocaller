import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Feedback } from './feedback.entity';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { User } from '../user/user.entity';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Feedback, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService, AdminGuard],
  exports: [FeedbackService],
})
export class FeedbackModule {}
