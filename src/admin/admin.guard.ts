import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';

@Injectable()
export class AdminGuard extends AuthGuard('jwt') {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First run JWT auth
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const jwtUser = request.user;

    if (!jwtUser?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Load user from DB to check actual role
    const user = await this.userRepository.findOne({ where: { id: jwtUser.userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    // Attach full user to request for downstream use
    request.user = { ...jwtUser, role: user.role, user };
    return true;
  }
}
