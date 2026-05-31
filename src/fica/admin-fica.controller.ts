import {
  Controller, Get, Patch, Param, Body, UseGuards, Request, ParseIntPipe, Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { Response } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { FicaService } from './fica.service';
import { sanitiseHeaderFilename } from '../common/sanitise-filename';

export class ReviewFicaDto {
  @IsIn(['approved', 'rejected']) decision: 'approved' | 'rejected';
  @IsOptional() @IsString() reason?: string;
}

@ApiTags('admin-fica')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('admin/fica')
export class AdminFicaController {
  constructor(private readonly fica: FicaService) {}

  @Get('submissions')
  @ApiOperation({ summary: '[admin] List all submitted/approved/rejected FICA submissions' })
  list() {
    return this.fica.listForReview();
  }

  @Get('submissions/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.fica.getById(id);
  }

  @Patch('submissions/:id/review')
  @ApiOperation({ summary: '[admin] Approve or reject a pending FICA submission' })
  review(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: ReviewFicaDto) {
    return this.fica.review(req.user.userId, id, dto.decision, dto.reason);
  }

  @Get('documents/:id/file')
  @ApiOperation({ summary: '[admin] Download a FICA document file' })
  async file(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, mime, name } = await this.fica.readFileBuffer(id);
    // Backend H11 fix: name is the user-supplied originalName at upload time.
    // Without sanitisation a filename containing CR/LF/quote can split or
    // inject response headers. See src/common/sanitise-filename.spec.ts.
    const safeName = sanitiseHeaderFilename(name);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.send(buffer);
  }
}
