import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { AssignmentStatus, ShiftKind } from '@prisma/client';

// утилита: превращаем query-параметр в массив строк
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return undefined;
}

export class GetStatisticsDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  workplaceId?: string;

  // ?assignmentStatuses=ACTIVE или ?assignmentStatuses=ACTIVE&assignmentStatuses=ARCHIVED
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsEnum(AssignmentStatus, { each: true })
  assignmentStatuses?: AssignmentStatus[];

  // ?kinds=DEFAULT или ?kinds=DEFAULT&kinds=OFFICE и т.д.
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsEnum(ShiftKind, { each: true })
  kinds?: ShiftKind[];
}