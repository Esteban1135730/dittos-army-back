import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import {
  StockReviewScope,
  StockReviewSession,
  StockReviewSessionDocument,
  StockReviewSessionStatus,
} from '../schema/stock-review-session.schema';
import type { StockTag } from '../constants/stock-tags';

const ACTIVE_STATUSES: StockReviewSessionStatus[] = [
  'en_verificacion',
  'pendiente_resolucion',
];

@Injectable()
export class StockReviewSessionRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<StockReviewSessionDocument> {
    return this.ownerModels.getModel<StockReviewSessionDocument>(StockReviewSession.name);
  }

  async findActive(): Promise<StockReviewSessionDocument | null> {
    return this.model
      .findOne({ status: { $in: ACTIVE_STATUSES } })
      .exec();
  }

  async findById(id: string): Promise<StockReviewSessionDocument | null> {
    return this.model.findById(id).exec();
  }

  /**
   * Inserta la sesión completa (items embebidos) en **una** escritura.
   * Los ítems no son documentos aparte: van en el mismo `insertMany`/`insertOne`.
   */
  async create(data: {
    scope: StockReviewScope;
    tag: StockTag | null;
    status: StockReviewSession['status'];
    items: StockReviewSession['items'];
  }): Promise<StockReviewSessionDocument> {
    const now = new Date();
    const [doc] = await this.model.insertMany([
      {
        ...data,
        created_at: now,
        updated_at: now,
      },
    ]);
    return doc;
  }

  async save(
    doc: StockReviewSessionDocument,
  ): Promise<StockReviewSessionDocument> {
    doc.updated_at = new Date();
    return doc.save();
  }

  /** Cambia solo status/timestamps; no reescribe el array `items`. */
  async updateStatusFields(
    id: string,
    patch: {
      status: StockReviewSessionStatus;
      completed_at?: Date;
    },
  ): Promise<StockReviewSessionDocument | null> {
    const $set: Record<string, unknown> = {
      status: patch.status,
      updated_at: new Date(),
    };
    if (patch.completed_at != null) {
      $set.completed_at = patch.completed_at;
    }
    return this.model
      .findByIdAndUpdate(id, { $set }, { new: true })
      .exec();
  }

  async markCancelled(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        $set: {
          status: 'cancelada',
          updated_at: new Date(),
        },
      })
      .exec();
  }
}
