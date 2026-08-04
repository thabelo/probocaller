import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Invite } from './invite.entity';
import { InviteService } from './invite.service';
import { InviteController } from './invite.controller';
import { User } from '../user/user.entity';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invite, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [InviteController],
  providers: [InviteService, AdminGuard],
  // Exported so signup can close the loop via markAccepted().
  exports: [InviteService],
})
export class InviteModule {}
