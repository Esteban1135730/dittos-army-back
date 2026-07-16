import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CardtraderReceiptService } from '../service/cardtrader/cardtrader-receipt.service';
import {
  FinalizeReceiptDto,
  InconsistencyLineDto,
  ReceiveLineDto,
} from '../Dto/cardtrader-receipt.dto';

@Controller('cardtrader/receipt')
export class CardtraderReceiptController {
  constructor(private readonly receiptService: CardtraderReceiptService) {}

  /** Sesión activa (open) + líneas, si existe. */
  @Get('sessions/active')
  getActiveSession() {
    return this.receiptService.getActiveSession();
  }

  /** Crear sesión (carga todas las transit lines abiertas). */
  @Post('sessions')
  @HttpCode(201)
  createSession() {
    return this.receiptService.createSession();
  }

  /** Detalle de sesión + líneas. */
  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.receiptService.getSession(id);
  }

  /** Marcar línea como recibida. */
  @Patch('sessions/:id/lines/:lineId/receive')
  receiveLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: ReceiveLineDto,
  ) {
    return this.receiptService.receiveLine(id, lineId, dto);
  }

  /** Marcar línea como inconsistencia. */
  @Patch('sessions/:id/lines/:lineId/inconsistency')
  markInconsistency(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: InconsistencyLineDto,
  ) {
    return this.receiptService.markInconsistency(id, lineId, dto);
  }

  /** Revertir línea a pending. */
  @Patch('sessions/:id/lines/:lineId/undo')
  undoLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.receiptService.undoLine(id, lineId);
  }

  /** Finalizar sesión (crea Stock y decrementa remaining_quantity). */
  @Post('sessions/:id/finalize')
  @HttpCode(200)
  finalize(
    @Param('id') id: string,
    @Body() dto: FinalizeReceiptDto,
  ) {
    return this.receiptService.finalize(id, dto);
  }

  /** Deshacer finalización. */
  @Post('sessions/:id/revert')
  @HttpCode(200)
  revertFinalization(@Param('id') id: string) {
    return this.receiptService.revertFinalization(id);
  }

  /** Cancelar sesión activa. */
  @Delete('sessions/:id')
  cancelSession(@Param('id') id: string) {
    return this.receiptService.cancelSession(id);
  }
}
