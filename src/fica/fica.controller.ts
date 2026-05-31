import {
  Controller, Get, Post, Param, Body, UseGuards, Request, ParseIntPipe,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
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
}

@ApiTags('fica')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('fica')
export class FicaController {
  constructor(private readonly fica: FicaService) {}

  @Get('requirements')
  @ApiOperation({ summary: 'List required FICA documents' })
  requirements() {
    return this.fica.getRequirements();
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
