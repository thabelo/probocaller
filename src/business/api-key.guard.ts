import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { BusinessService } from './business.service';

/**
 * Authenticates a request by its `x-api-key` header, resolving the owning
 * business and attaching it as `request.business`. Used by the /leads API that
 * businesses call programmatically.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly businessService: BusinessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-api-key'];
    const apiKey = await this.businessService.findActiveApiKey(key);
    if (!apiKey || !apiKey.business) throw new UnauthorizedException('Invalid or missing API key');
    request.apiKey = apiKey;
    request.business = apiKey.business;
    return true;
  }
}
