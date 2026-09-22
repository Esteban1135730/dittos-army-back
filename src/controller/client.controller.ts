import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Client } from 'src/schema/client.schema';
import { ClientRepository } from 'src/repository/client.repository';
import { ClientDto } from 'src/Dto/client.dto';
import { getClientContactValidationError } from 'src/utils/client-contact';

@Controller('client')
export class ClientController {
  constructor(private readonly clientRepository: ClientRepository) {}

  @Get()
  async getAll(): Promise<Client[]> {
    return this.clientRepository.findAll();
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<Client | null> {
    return this.clientRepository.findById(id);
  }

  @Post()
  async create(@Body() dto: ClientDto): Promise<Client> {
    if (!dto.nombre || !dto.metodo_contacto) {
      throw new BadRequestException('nombre y metodo_contacto son requeridos');
    }
    const contactErr = getClientContactValidationError(dto);
    if (contactErr) {
      throw new BadRequestException(contactErr);
    }
    return this.clientRepository.create(dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: ClientDto,
  ): Promise<Client | null> {
    const contactErr = getClientContactValidationError(dto);
    if (contactErr) {
      throw new BadRequestException(contactErr);
    }
    return this.clientRepository.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.clientRepository.delete(id);
    return { success };
  }
}
