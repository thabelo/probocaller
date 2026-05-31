import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, ParseIntPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
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
      registrationNumber?: string;
      website?: string;
      description?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
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
}
