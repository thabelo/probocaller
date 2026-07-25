import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { BusinessLogoService } from './business-logo.service';

// Hard multer ceiling above the service's 2MB business rule: the service still
// returns a friendly 400 for 2–5MB; multer only stops a genuinely abusive body.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags('business')
@Controller('business')
export class BusinessLogoController {
  constructor(private readonly logos: BusinessLogoService) {}

  @Post('logo')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a business logo image (returns a URL for /business/register)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image was uploaded');
    return this.logos.save(file);
  }

  // Public on purpose: a logo has to load in an <img> on every caller's screen.
  @Get('logo/:filename')
  @ApiOperation({ summary: 'Serve a business logo image (public)' })
  serve(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response): StreamableFile {
    const { absPath, contentType } = this.logos.resolve(filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return new StreamableFile(createReadStream(absPath));
  }
}
