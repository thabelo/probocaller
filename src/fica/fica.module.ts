import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { FicaSubmission } from './entities/fica-submission.entity';
import { FicaDocument } from './entities/fica-document.entity';
import { FicaService } from './fica.service';
import { FicaController } from './fica.controller';
import { AdminFicaController } from './admin-fica.controller';
import { AdminGuard } from '../admin/admin.guard';
import { User } from '../user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([FicaSubmission, FicaDocument, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [FicaController, AdminFicaController],
  providers: [FicaService, AdminGuard],
  exports: [FicaService],
})
export class FicaModule {}
