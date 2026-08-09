import {
  Controller, Get, Post, Param, Body, UseGuards, Request, ParseIntPipe,
  UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { sanitiseHeaderFilename } from '../common/sanitise-filename';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MinLength } from 'class-validator';
import { FicaService } from './fica.service';
import { FicaDocType } from './entities/fica-document.entity';

export class SubmitFicaDto {
  @IsString() @MinLength(2) fullName: string;
  @IsString() @MinLength(4) idNumber: string;
  @IsOptional() @IsIn(['sa_id', 'passport']) idType?: string;
  @IsString() @MinLength(4) residentialAddress: string;
  @IsOptional() @IsString() countryCode?: string;
}

@ApiTags('fica')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('fica')
export class FicaController {
  constructor(private readonly fica: FicaService) {}

  /**
   * Stream back one of the caller's OWN documents, so the app can show what was
   * uploaded rather than a bare "Uploaded" tick. Ownership is enforced in the
   * service — these are ID documents, and the admin download deliberately has no
   * such check because it sits behind AdminGuard.
   */
  @Get('documents/:id/file')
  @ApiOperation({ summary: 'Preview one of your own uploaded FICA documents' })
  async ownFile(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, mime, name } = await this.fica.readOwnFileBuffer(req.user.userId, id);
    // originalName is user-supplied at upload time; unsanitised CR/LF or quotes
    // in it can split or inject response headers.
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${sanitiseHeaderFilename(name)}"`);
    res.send(buffer);
  }

  @Get('requirements')
  @ApiOperation({ summary: 'List required FICA documents (defaults to South Africa)' })
  requirements() {
    return this.fica.getRequirements();
  }

  @Get('requirements/:countryCode')
  @ApiOperation({ summary: 'List required FICA documents for a specific country' })
  requirementsForCountry(@Param('countryCode') countryCode: string) {
    return this.fica.getRequirements(countryCode);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get my current FICA submission (draft / pending / approved)' })
  async status(@Request() req) {
    const submission = await this.fica.getMyActiveSubmission(req.user.userId);
    return { submission, approved: submission?.status === 'approved' };
  }

  @Get('submissions')
  list(@Request() req) {
    return this.fica.getMySubmissions(req.user.userId);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Create or update my FICA submission with personal info' })
  submit(@Request() req, @Body() dto: SubmitFicaDto) {
    return this.fica.submit(req.user.userId, dto);
  }

  @Post('submissions/:id/documents')
  @ApiOperation({ summary: 'Upload a FICA document (id_document, proof_of_address, selfie)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentType', 'file'],
      properties: {
        documentType: { type: 'string', example: 'id_document' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('documentType') documentType: FicaDocType,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.fica.uploadDocument(req.user.userId, id, documentType, file);
  }
}
