import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IncomingHomologService } from '../service/incoming-homolog.service';
import type {
  CreateHomologTandaDto,
  CreateBatchNovedadDto,
  MaterializeNovedadStockDto,
  UndoNovedadStockDto,
  NovedadHomologUnitDto,
  VerifyHomologUnitDto,
} from '../Dto/incoming-homolog.dto';

@Controller('incoming/homolog')
export class IncomingHomologController {
  constructor(private readonly homologService: IncomingHomologService) {}

  @Get('active')
  async getActive() {
    return this.homologService.getActiveSession();
  }

  @Post('sessions')
  async createSession() {
    return this.homologService.createSession();
  }

  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    return this.homologService.getSession(sessionId);
  }

  @Post('sessions/:sessionId/sync')
  async syncSent(@Param('sessionId') sessionId: string) {
    return this.homologService.syncCardtraderSent(sessionId);
  }

  @Post('sessions/:sessionId/auto-verify-by-blueprint')
  @HttpCode(200)
  async autoVerifyByBlueprint(@Param('sessionId') sessionId: string) {
    return this.homologService.autoVerifyExact(sessionId);
  }

  @Post('sessions/:sessionId/auto-verify-by-product')
  @HttpCode(200)
  async autoVerifyByProduct(@Param('sessionId') sessionId: string) {
    return this.homologService.autoVerifyExact(sessionId);
  }

  @Patch('sessions/:sessionId/units/:sentUnitKey/verify')
  async verifyUnit(
    @Param('sessionId') sessionId: string,
    @Param('sentUnitKey') sentUnitKey: string,
    @Body() body: VerifyHomologUnitDto,
  ) {
    const transitLineId = body.transit_line_id?.trim() || body.batch_item_id?.trim();
    if (!transitLineId) {
      throw new BadRequestException('transit_line_id es requerido');
    }
    return this.homologService.verifyUnit(
      sessionId,
      decodeURIComponent(sentUnitKey),
      transitLineId,
      body.match_score,
    );
  }

  @Patch('sessions/:sessionId/units/:sentUnitKey/novedad')
  async markNovedad(
    @Param('sessionId') sessionId: string,
    @Param('sentUnitKey') sentUnitKey: string,
    @Body() body: NovedadHomologUnitDto,
  ) {
    const panelLineId =
      body.transit_line_id?.trim() || body.batch_item_id?.trim();
    return this.homologService.markNovedad(
      sessionId,
      decodeURIComponent(sentUnitKey),
      body.notes,
      panelLineId,
    );
  }

  @Patch('sessions/:sessionId/units/:sentUnitKey/undo')
  async undoUnit(
    @Param('sessionId') sessionId: string,
    @Param('sentUnitKey') sentUnitKey: string,
  ) {
    return this.homologService.undoUnit(
      sessionId,
      decodeURIComponent(sentUnitKey),
    );
  }

  @Post('sessions/:sessionId/create-tanda')
  async createTanda(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateHomologTandaDto,
  ) {
    return this.homologService.createTanda(sessionId, body);
  }

  @Delete('sessions/:sessionId')
  async cancelSession(@Param('sessionId') sessionId: string) {
    return this.homologService.cancelSession(sessionId);
  }

  @Post('sessions/:sessionId/revert-conversion')
  async revertConversion(@Param('sessionId') sessionId: string) {
    return this.homologService.revertConversion(sessionId);
  }

  @Get('novedades')
  async listNovedades() {
    return this.homologService.listNovedades();
  }

  @Post('novedades')
  async createPanelNovedad(@Body() body: CreateBatchNovedadDto) {
    return this.homologService.createPanelNovedad(body);
  }

  @Patch('novedades/:novedadId/resolve')
  async resolveNovedad(@Param('novedadId') novedadId: string) {
    return this.homologService.resolveNovedad(novedadId);
  }

  @Get('novedad-stock')
  async listNovedadStock() {
    return this.homologService.listNovedadStockCards();
  }

  @Delete('novedad-stock')
  async clearNovedadStock() {
    return this.homologService.clearNovedadStockTable();
  }

  @Post('novedad-stock/sync')
  async syncNovedadStock(@Body() body: { session_id?: string }) {
    return this.homologService.syncNovedadStockFromSession(body?.session_id);
  }

  @Post('novedad-stock/preview')
  async previewMaterializeNovedadStock(@Body() body: MaterializeNovedadStockDto) {
    return this.homologService.previewMaterializeNovedadStock(body);
  }

  @Post('novedad-stock/materialize')
  async materializeNovedadStock(@Body() body: MaterializeNovedadStockDto) {
    return this.homologService.materializeNovedadStock(body);
  }

  @Post('novedad-stock/undo-materialize')
  async undoNovedadStockMaterialize(@Body() body: UndoNovedadStockDto) {
    return this.homologService.undoNovedadStockMaterialize(body);
  }

  @Post('novedad-stock/apply-manual-tcgdex')
  async applyManualNovedadTcgdex() {
    return this.homologService.applyManualNovedadTcgdexFixes();
  }

  @Patch('novedad-stock/:id/resolve')
  async resolveNovedadStock(@Param('id') id: string) {
    return this.homologService.resolveNovedadStockCard(id);
  }
}
