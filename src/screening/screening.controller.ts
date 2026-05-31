import {
  Body, Controller, Get, Post, Request, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ScreeningService, ScreeningSignals } from './screening.service';

@ApiTags('screening')
@ApiBearerAuth()
@Controller('screening')
@UseGuards(AuthGuard('jwt'))
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Post()
  @ApiOperation({ summary: 'Record an AI-assistant screening outcome for an incoming call' })
  record(
    @Request() req,
    @Body() body: { callerNumber: string; signals: ScreeningSignals; audioRef?: string },
  ) {
    return this.screeningService.recordScreening(
      req.user.userId,
      body?.callerNumber,
      body?.signals || {},
      body?.audioRef,
    );
  }

  @Post('audio')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a screened-call recording; returns an audioRef for POST /screening' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadAudio(@Request() req, @UploadedFile() file: Express.Multer.File) {
    return { audioRef: this.screeningService.storeAudio(req.user.userId, file) };
  }

  @Get('history')
  @ApiOperation({ summary: 'List my recent screened calls (transcripts + summaries)' })
  history(@Request() req) {
    return this.screeningService.getHistory(req.user.userId);
  }
}
