import { InjectModel } from '@nestjs/mongoose';
import { Client, ClientDocument } from '../schema/client.schema';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { ClientDto } from 'src/Dto/client.dto';

@Injectable()
export class ClientRepository {
  constructor(
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
  ) {}

  async create(dto: ClientDto): Promise<Client> {
    const notasTrim = dto.notas?.trim();
    const created = new this.clientModel({
      nombre: dto.nombre,
      tienda_entrega: dto.tienda_entrega,
      celular: dto.celular,
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
          tienda_entrega: dto.tienda_entrega,
          celular: dto.celular,
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
}
