import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, ParseIntPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { BusinessService } from './business.service';

@ApiTags('business')
@ApiBearerAuth()
@Controller('business')
@UseGuards(AuthGuard('jwt'))
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('purposes')
  @ApiOperation({ summary: 'List all available number purpose categories' })
  getPurposes() {
    return this.businessService.getPurposes();
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a business profile for the current user' })
  register(
    @Request() req,
    @Body() body: {
      companyName: string;
      industry: string;
      country: string;
      registrationNumber?: string;
      website?: string;
      description?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      logoUrl?: string;
    },
  ) {
    return this.businessService.register(req.user.userId, body);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my most recently created business profile' })
  getProfile(@Request() req) {
    return this.businessService.getMyProfile(req.user.userId);
  }

  @Get('profiles')
  @ApiOperation({ summary: 'Get all my business profiles' })
  getProfiles(@Request() req) {
    return this.businessService.getMyProfiles(req.user.userId);
  }

  @Put('profile/:businessId')
  @ApiOperation({ summary: 'Update a specific business profile by id' })
  updateProfile(
    @Request() req,
    @Param('businessId', ParseIntPipe) businessId: number,
    @Body() body: any,
  ) {
    return this.businessService.updateProfile(req.user.userId, businessId, body);
  }

  @Post('numbers')
  @ApiOperation({ summary: 'Add a phone number with purpose to a business profile' })
  addNumber(
    @Request() req,
    @Body() body: { businessId: number; phoneNumber: string; purpose: string; label?: string },
  ) {
    return this.businessService.addNumber(req.user.userId, body);
  }

  @Get('numbers')
  @ApiOperation({ summary: 'List all numbers for a specific business profile' })
  getNumbers(@Request() req, @Query('businessId', ParseIntPipe) businessId: number) {
    return this.businessService.getNumbers(req.user.userId, businessId);
  }

  @Put('numbers/:id')
  @ApiOperation({ summary: 'Update a registered number' })
  updateNumber(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { purpose?: string; label?: string; active?: boolean },
  ) {
    return this.businessService.updateNumber(req.user.userId, id, body);
  }

  @Delete('numbers/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a number from my business profile' })
  deleteNumber(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.businessService.deleteNumber(req.user.userId, id);
  }

  // ─── Admin: API key management (businesses use keys to call /leads) ──────────

  @Get('admin/api-keys')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: list every API key with its business' })
  adminListApiKeys() {
    return this.businessService.adminListApiKeys();
  }

  @Post('admin/:businessId/api-keys')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: create a scoped API key for a business' })
  adminCreateApiKey(
    @Param('businessId', ParseIntPipe) businessId: number,
    @Body() body: { label?: string; scopes?: string[] },
  ) {
    return this.businessService.createApiKey(businessId, body || {});
  }

  @Post('admin/api-keys/:id/revoke')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: revoke an API key' })
  adminRevokeApiKey(@Param('id', ParseIntPipe) id: number) {
    return this.businessService.revokeApiKey(id);
  }

  // ─── Business self-service: manage only your own keys ────────────────────────

  @Get('api-keys')
  @ApiOperation({ summary: 'List the API keys of the businesses I own' })
  listMyApiKeys(@Request() req) {
    return this.businessService.listApiKeysForUser(req.user.userId);
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Create a scoped API key for one of my KYB-verified businesses' })
  createMyApiKey(
    @Request() req,
    @Body() body: { businessId: number; label?: string; scopes?: string[] },
  ) {
    return this.businessService.createApiKeyForUser(req.user.userId, body.businessId, {
      label: body.label,
      scopes: body.scopes,
    });
  }

  @Post('api-keys/:id/revoke')
  @ApiOperation({ summary: 'Revoke one of my own API keys' })
  revokeMyApiKey(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.businessService.revokeApiKeyForUser(req.user.userId, id);
  }

  // ─── Business wallet (balance the call/API billing deducts from) ─────────────

  @Get(':businessId/wallet')
  @ApiOperation({ summary: 'Get a business wallet — balance + transaction ledger' })
  getWallet(@Request() req, @Param('businessId', ParseIntPipe) businessId: number) {
    return this.businessService.getWallet(businessId, req.user.userId);
  }

  @Post(':businessId/wallet/topup')
  @ApiOperation({ summary: 'Add funds to a business wallet' })
  topUpWallet(
    @Request() req,
    @Param('businessId', ParseIntPipe) businessId: number,
    @Body() body: { amount: number },
  ) {
    return this.businessService.topUpWallet(businessId, req.user.userId, Number(body?.amount));
  }

  @Post(':businessId/wallet/transfer')
  @ApiOperation({ summary: "Move money between the owner's balance and this business wallet ('in' = owner→business, 'out' = business→owner)" })
  transferWallet(
    @Request() req,
    @Param('businessId', ParseIntPipe) businessId: number,
    @Body() body: { amount: number; direction: 'in' | 'out' },
  ) {
    return this.businessService.transferWallet(
      businessId,
      req.user.userId,
      Number(body?.amount),
      body?.direction === 'out' ? 'out' : 'in',
    );
  }
}
