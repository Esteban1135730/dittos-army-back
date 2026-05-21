import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CreateElectronicInvoiceDto } from 'src/integrations/factus/dto/create-electronic-invoice.dto';
import { BillingBillableItemsService } from 'src/service/billing-billable-items.service';
import { BillingFactusService } from 'src/service/billing-factus.service';

@Controller('billing/factus')
export class FactusBillingController {
  constructor(
    private readonly billingFactusService: BillingFactusService,
    private readonly billableItemsService: BillingBillableItemsService,
  ) {}

  @Get('client/:clientId/billable-items')
  async listBillableItems(@Param('clientId') clientId: string) {
    try {
      const items = await this.billableItemsService.listForClient(clientId);
      return { success: true, items };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error al listar ítems';
      return { success: false, message, items: [] };
    }
  }

  @Post('invoice')
  async createInvoiceDraft(@Body() dto: CreateElectronicInvoiceDto) {
    const invoice = await this.billingFactusService.createDraft(dto);
    return { success: true, invoice };
  }

  @Post('invoice/:id/send')
  async sendInvoice(@Param('id') id: string, @Req() req: Request) {
    try {
      const invoice = await this.billingFactusService.sendInvoice(
        id,
        req.correlationId || 'missing-correlation-id',
      );
      return { success: true, invoice };
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'No fue posible enviar la factura';
      throw new HttpException(
        { success: false, message },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('invoice/:id/status')
  async getInvoiceStatus(@Param('id') id: string, @Req() req: Request) {
    try {
      const invoice = await this.billingFactusService.checkStatus(
        id,
        req.correlationId || 'missing-correlation-id',
      );
      return { success: true, invoice };
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'No fue posible consultar el estado';
      throw new HttpException(
        { success: false, message },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
