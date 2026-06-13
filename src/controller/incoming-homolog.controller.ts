import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IncomingHomologService } from '../service/incoming-homolog.service';
import type {
  CreateHomologTandaDto,
  CreateBatchNovedadDto,
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

  @Patch('sessions/:sessionId/units/:sentUnitKey/verify')
  async verifyUnit(
    @Param('sessionId') sessionId: string,
    @Param('sentUnitKey') sentUnitKey: string,
    @Body() body: VerifyHomologUnitDto,
  ) {
    return this.homologService.verifyUnit(
      sessionId,
      decodeURIComponent(sentUnitKey),
      body.batch_item_id,
      body.match_score,
    );
  }

  @Patch('sessions/:sessionId/units/:sentUnitKey/novedad')
  async markNovedad(
    @Param('sessionId') sessionId: string,
    @Param('sentUnitKey') sentUnitKey: string,
    @Body() body: NovedadHomologUnitDto,
  ) {
    return this.homologService.markNovedad(
      sessionId,
      decodeURIComponent(sentUnitKey),
      body.notes,
      body.batch_item_id,
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
}
