import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { CardtraderQuoteSessionRepository } from '../../repository/cardtrader-quote-session.repository';
import type {
  QuoteSessionStatus,
} from '../../schema/cardtrader-quote-session.schema';
import {
  buildQuoteSessionLines,
  parsePickBlueprint,
  parseQuoteSessionSource,
  parseRawPaste,
  toSessionDetail,
  toSessionListItem,
  type QuoteSessionCreateInput,
  type QuoteSessionPickInput,
} from './cardtrader-quote-session.mapper';

@Injectable()
export class CardTraderQuoteSessionService {
  constructor(private readonly repo: CardtraderQuoteSessionRepository) {}

  async create(body: QuoteSessionCreateInput) {
    const source = parseQuoteSessionSource(body.source);
    const rawPaste = parseRawPaste(body.raw_paste);
    const lines = buildQuoteSessionLines(body.lines);
    const created = await this.repo.create({
      status: 'in_progress',
      source,
      raw_paste: rawPaste,
      active_index: 0,
      lines,
    });
    return toSessionDetail(created.toObject());
  }

  async list(statusRaw?: string) {
    const status = (statusRaw?.trim() || 'in_progress') as QuoteSessionStatus;
    if (
      status !== 'in_progress' &&
      status !== 'completed' &&
      status !== 'cancelled'
    ) {
      throw new BadRequestException('status inválido');
    }
    const docs = await this.repo.listByStatus(status, 20);
    return { items: docs.map((d) => toSessionListItem(d.toObject())) };
  }

  async getById(id: string) {
    const doc = await this.requireSession(id);
    return toSessionDetail(doc.toObject());
  }

  async patchSession(
    id: string,
    body: { active_index?: number; status?: string },
  ) {
    const doc = await this.requireSession(id);
    if (body.active_index !== undefined) {
      const idx = Number(body.active_index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= doc.lines.length) {
        throw new BadRequestException('active_index fuera de rango');
      }
      doc.active_index = idx;
    }
    if (body.status !== undefined) {
      const next = String(body.status).trim();
      if (next !== 'completed' && next !== 'cancelled') {
        throw new BadRequestException('status debe ser completed o cancelled');
      }
      if (doc.status !== 'in_progress') {
        throw new BadRequestException('solo se puede cerrar una sesión in_progress');
      }
      doc.status = next;
    }
    await this.repo.save(doc);
    return toSessionDetail(doc.toObject());
  }

  async patchLine(
    id: string,
    lineIndexRaw: string,
    body: { action?: string } & QuoteSessionPickInput,
  ) {
    const doc = await this.requireSession(id);
    if (doc.status !== 'in_progress') {
      throw new BadRequestException('la sesión no está in_progress');
    }
    const lineIndex = Number(lineIndexRaw);
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= doc.lines.length) {
      throw new NotFoundException('línea no encontrada');
    }
    const action = String(body.action ?? '').trim();
    const line = doc.lines[lineIndex];
    if (action === 'pick') {
      line.selected_blueprint = parsePickBlueprint(body);
      line.line_status = 'picked';
    } else if (action === 'undo_pick') {
      line.selected_blueprint = null;
      line.line_status = 'pending';
    } else if (action === 'skip') {
      line.line_status = 'skipped';
    } else {
      throw new BadRequestException('action debe ser pick, undo_pick o skip');
    }
    doc.markModified('lines');
    await this.repo.save(doc);
    return toSessionDetail(doc.toObject());
  }

  private async requireSession(id: string) {
    if (!id?.trim() || !isValidObjectId(id)) {
      throw new BadRequestException('id de sesión inválido');
    }
    const doc = await this.repo.findById(id.trim());
    if (!doc) throw new NotFoundException('sesión no encontrada');
    return doc;
  }
}
