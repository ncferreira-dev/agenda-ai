import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentBusiness } from '../../auth/decorators/current-business.decorator';
import {
  BlocksService,
  type BlockInput,
  type RecurringBlockInput,
} from './blocks.service';

@Controller('me/blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private blocks: BlocksService) {}

  @Get()
  list(@CurrentBusiness() businessId: string) {
    return this.blocks.list(businessId);
  }

  @Post()
  create(@CurrentBusiness() businessId: string, @Body() body: BlockInput) {
    return this.blocks.create(businessId, body);
  }

  @Delete(':id')
  remove(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.blocks.remove(businessId, id);
  }
}

@Controller('me/recurring-blocks')
@UseGuards(JwtAuthGuard)
export class RecurringBlocksController {
  constructor(private blocks: BlocksService) {}

  @Get()
  list(@CurrentBusiness() businessId: string) {
    return this.blocks.listRecurring(businessId);
  }

  @Post()
  create(@CurrentBusiness() businessId: string, @Body() body: RecurringBlockInput) {
    return this.blocks.createRecurring(businessId, body);
  }

  @Delete(':id')
  remove(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.blocks.removeRecurring(businessId, id);
  }
}
