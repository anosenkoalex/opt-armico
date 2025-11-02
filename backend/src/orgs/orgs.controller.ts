import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrgsService } from './orgs.service.js';
import { CreateOrgDto, createOrgSchema } from './dto/create-org.dto.js';
import { UpdateOrgDto, updateOrgSchema } from './dto/update-org.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';

@Controller('orgs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body(new ZodValidationPipe(createOrgSchema)) payload: CreateOrgDto) {
    return this.orgsService.create(payload);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll() {
    return this.orgsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.orgsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrgSchema)) payload: UpdateOrgDto,
  ) {
    return this.orgsService.update(id, payload);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.orgsService.remove(id);
  }
}
