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
    const created = new this.clientModel({
      ...dto,
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
        { ...dto, updated_at: new Date() },
        { new: true },
      )
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.clientModel.findByIdAndDelete(id).exec();
    return !!result;
  }
}
