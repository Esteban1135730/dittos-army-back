import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateElectronicInvoiceDto } from 'src/integrations/factus/dto/create-electronic-invoice.dto';
import { BillingFactusService } from 'src/service/billing-factus.service';

@Controller('billing/factus')
export class FactusBillingController {
  constructor(private readonly billingFactusService: BillingFactusService) {}

  @Post('invoice')
  async createInvoiceDraft(@Body() dto: CreateElectronicInvoiceDto) {
    const invoice = await this.billingFactusService.createDraft(dto);
    return { success: true, invoice };
  }

  @Post('invoice/:id/send')
  async sendInvoice(@Param('id') id: string, @Req() req: Request) {
    const invoice = await this.billingFactusService.sendInvoice(
      id,
      req.correlationId || 'missing-correlation-id',
    );
    return { success: true, invoice };
  }

  @Get('invoice/:id/status')
  async getInvoiceStatus(@Param('id') id: string, @Req() req: Request) {
    const invoice = await this.billingFactusService.checkStatus(
      id,
      req.correlationId || 'missing-correlation-id',
    );
    return { success: true, invoice };
  }
}
