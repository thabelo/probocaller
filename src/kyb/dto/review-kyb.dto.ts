import { IsString, IsNotEmpty, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewKybDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'under_review'] })
  @IsString()
  @IsIn(['approved', 'rejected', 'under_review'])
  status: 'approved' | 'rejected' | 'under_review';

  @ApiPropertyOptional({ description: 'Required when status is "rejected"' })
  @ValidateIf((o) => o.status === 'rejected')
  @IsString()
  @IsNotEmpty()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Internal reviewer notes (not shown to business)' })
  @IsOptional()
  @IsString()
  reviewerNotes?: string;
}
