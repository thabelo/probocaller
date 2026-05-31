import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { KybService } from './kyb.service';
import { SubmitKybDto } from './dto/submit-kyb.dto';

@ApiTags('kyb')
@ApiBearerAuth()
@Controller('kyb')
@UseGuards(AuthGuard('jwt'))
export class KybController {
  constructor(private readonly kybService: KybService) {}

  @Get('countries')
  @ApiOperation({ summary: 'List all countries supported for KYB verification' })
  getSupportedCountries() {
    return this.kybService.getSupportedCountries();
  }

  @Get('requirements/:countryCode')
  @ApiOperation({
    summary: 'Get KYB document and business info requirements for a specific country',
    description: 'Returns the list of required documents and business info fields for the given ISO 3166-1 alpha-2 country code.',
  })
  getRequirements(@Param('countryCode') countryCode: string) {
    return this.kybService.getRequirements(countryCode);
  }

  @Post('submit')
  @ApiOperation({
    summary: 'Start a new KYB submission',
    description: 'Creates a KYB application in "draft" status. Upload required documents afterwards via POST /kyb/submissions/:id/documents. Status auto-advances to "pending" once all required documents are uploaded.',
  })
  submitKyb(@Request() req, @Body() dto: SubmitKybDto) {
    return this.kybService.submitKyb(req.user.userId, dto);
  }

  @Post('submissions/:id/documents')
  @ApiOperation({
    summary: 'Upload a KYB document for a submission',
    description: 'Upload one document file per request. Use the documentType keys returned by GET /kyb/requirements/:countryCode. Re-uploading the same documentType replaces the previous file.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentType', 'file'],
      properties: {
        documentType: { type: 'string', example: 'cipc_certificate' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadDocument(
    @Request() req,
    @Param('id', ParseIntPipe) submissionId: number,
    @Body('documentType') documentType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.kybService.uploadDocument(req.user.userId, submissionId, documentType, file);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get my active KYB submission (draft / pending / under_review)' })
  getActiveSubmission(@Request() req) {
    return this.kybService.getMyActiveSubmission(req.user.userId);
  }

  @Get('submissions')
  @ApiOperation({ summary: 'Get all my KYB submissions (including historical)' })
  getMySubmissions(@Request() req) {
    return this.kybService.getMySubmissions(req.user.userId);
  }
}
