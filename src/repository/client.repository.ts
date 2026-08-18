import { Client, ClientDocument } from '../schema/client.schema';
import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import { ClientDto } from 'src/Dto/client.dto';
import { toCelularE164 } from 'src/utils/phone-normalize';

@Injectable()
export class ClientRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get clientModel(): Model<ClientDocument> {
    return this.ownerModels.getModel<ClientDocument>(Client.name);
  }

  async create(dto: ClientDto): Promise<Client> {
    const notasTrim = dto.notas?.trim();
    const created = new this.clientModel({
      nombre: dto.nombre,
      celular: dto.celular,
      celular_e164: toCelularE164(dto.celular),
      metodo_contacto: dto.metodo_contacto,
      facebook_usuario:
        dto.metodo_contacto === 'facebook'
          ? dto.facebook_usuario?.trim() || undefined
          : null,
      notas: notasTrim ? notasTrim : undefined,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return created.save();
  }

  async findAll(): Promise<Client[]> {
    return this.clientModel.find().sort({ nombre: 1 }).exec();
  }

  async findById(id: string): Promise<Client | null> {
    return this.clientModel.findById(id).exec();
  }

  async update(id: string, dto: ClientDto): Promise<Client | null> {
    return this.clientModel
      .findByIdAndUpdate(
        id,
        {
          nombre: dto.nombre,
          celular: dto.celular,
          celular_e164: toCelularE164(dto.celular) ?? null,
          metodo_contacto: dto.metodo_contacto,
          facebook_usuario:
            dto.metodo_contacto === 'facebook'
              ? dto.facebook_usuario?.trim() || undefined
              : null,
          notas: dto.notas?.trim() ? dto.notas.trim() : null,
          updated_at: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.clientModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async findByCelularE164(waId: string): Promise<ClientDocument | null> {
    if (!waId || typeof waId !== 'string' || !/^\d{10,15}$/.test(waId)) {
      return null;
    }
    return this.clientModel.findOne({ celular_e164: waId }).exec();
  }

  async findAllWithCelular(): Promise<ClientDocument[]> {
    return this.clientModel
      .find({ celular: { $exists: true, $nin: [null, ''] } })
      .exec();
  }
}
