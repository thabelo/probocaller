import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CallService } from './call.service';
import { AuthGuard } from '@nestjs/passport';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { CompleteCallDto } from './dto/complete-call.dto';
import { RateCallDto } from './dto/rate-call.dto';

@ApiTags('calls')
@ApiBearerAuth()
@Controller('call')
@UseGuards(AuthGuard('jwt'))
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('initiate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Initiate a call' })
  @ApiResponse({ status: 200, description: 'Call initiated or blocked' })
  async initiateCall(@Request() req, @Body() body: InitiateCallDto) {
    return this.callService.initiateCall(req.user.userId, body.toPhoneNumber);
  }

  @Post('complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a call' })
  @ApiResponse({ status: 200, description: 'Call completed and earnings transferred' })
  async completeCall(@Request() req, @Body() body: CompleteCallDto) {
    return this.callService.completeCall(req.user.userId, body.callId, body.duration);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get call history for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Returns call history' })
  async getCallHistory(@Request() req, @Query('period') period?: string) {
    return this.callService.getCallHistory(req.user.userId, period);
  }

  @Get('business/:businessId')
  @ApiOperation({ summary: "Call history for one of the caller's businesses" })
  async getBusinessCallHistory(@Request() req, @Param('businessId') businessId: string, @Query('period') period?: string) {
    return this.callService.getBusinessCallHistory(req.user.userId, Number(businessId), period);
  }

  @Post('rate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rate a completed business call (1–5 stars)' })
  async rateCall(@Request() req, @Body() body: RateCallDto) {
    return this.callService.rateCall(req.user.userId, body.callId, body.rating, body.comment);
  }

  @Get(':id/rating')
  @ApiOperation({ summary: 'Get existing rating for a call' })
  async getCallRating(@Param('id') id: number) {
    return this.callService.getCallRating(Number(id));
  }
}

@ApiTags('calls')
@ApiBearerAuth()
@Controller('user/call')
@UseGuards(AuthGuard('jwt'))
export class CallAliasController {
  constructor(private readonly callService: CallService) {}

  @Post('initiate')
  @HttpCode(200)
  async initiateCall(@Request() req, @Body() body: InitiateCallDto) {
    return this.callService.initiateCall(req.user.userId, body.toPhoneNumber);
  }

  @Post('complete')
  @HttpCode(200)
  async completeCall(@Request() req, @Body() body: CompleteCallDto) {
    return this.callService.completeCall(req.user.userId, body.callId, body.duration);
  }

  @Get('history')
  async getCallHistory(@Request() req, @Query('period') period?: string) {
    return this.callService.getCallHistory(req.user.userId, period);
  }

  @Get('business/:businessId')
  async getBusinessCallHistory(@Request() req, @Param('businessId') businessId: string, @Query('period') period?: string) {
    return this.callService.getBusinessCallHistory(req.user.userId, Number(businessId), period);
  }

  @Post('rate')
  @HttpCode(200)
  async rateCall(@Request() req, @Body() body: RateCallDto) {
    return this.callService.rateCall(req.user.userId, body.callId, body.rating, body.comment);
  }
}
