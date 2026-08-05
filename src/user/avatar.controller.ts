import {
  Controller,
  Get,
  Post,
  Request,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AvatarService } from './avatar.service';

/**
 * The optional profile photo shown for caller ID.
 *
 * Every route is keyed on the JWT subject rather than a caller-supplied id —
 * these carry someone's face, and an id in the path would let anyone read
 * anyone's photo by guessing a number.
 */
@ApiTags('profile photo')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('user/me/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Post()
  @ApiOperation({ summary: 'Upload or replace your profile photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(@Request() req, @UploadedFile() file: Express.Multer.File) {
    const user = await this.avatars.upload(req.user.userId, file);
    // Where it sits on disk is an internal detail; the client only needs to
    // know one is set so it can render the image.
    return { hasPhoto: !!user.avatarPath };
  }

  @Get()
  @ApiOperation({ summary: 'Your profile photo' })
  async read(@Request() req, @Res() res: Response) {
    const { buffer, mimeType } = await this.avatars.read(req.user.userId);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=300',
    });
    res.send(buffer);
  }
}
