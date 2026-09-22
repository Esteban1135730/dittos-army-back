import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SyncTokenGuard } from 'src/guard/sync-token.guard';
import {
  MobilePendingSaleService,
  type CreateMobilePendingDto,
} from 'src/service/mobile-pending-sale.service';

@Controller('sales/mobile-pending')
@UseGuards(SyncTokenGuard)
export class MobilePendingSaleController {
  constructor(private readonly service: MobilePendingSaleService) {}

  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateMobilePendingDto) {
    return this.service.create(body ?? ({} as CreateMobilePendingDto));
  }

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('ids') ids?: string,
    @Query('client_sale_id') client_sale_id?: string,
  ) {
    return this.service.list({ status, ids, client_sale_id });
  }

  @Post(':id/accept')
  async accept(@Param('id') id: string) {
    return this.service.accept(id);
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string) {
    const pending = await this.service.reject(id);
    return { status: pending.status, pending };
  }
}
