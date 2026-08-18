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
import { PedidoCreateDto, PedidoPatchDto } from 'src/Dto/pedido.dto';
import { RequireFeature } from 'src/owner/feature-acl.guard';
import { PedidoService } from 'src/service/pedido.service';

@Controller('pedido')
@RequireFeature('clientes')
export class PedidoController {
  constructor(private readonly pedidoService: PedidoService) {}

  @Get('tiendas')
  listTiendas() {
    return this.pedidoService.listTiendas();
  }

  @Get('client/:clientId')
  listByClient(@Param('clientId') clientId: string) {
    return this.pedidoService.listByClient(clientId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.pedidoService.getById(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: PedidoCreateDto) {
    return this.pedidoService.create(dto);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: PedidoPatchDto) {
    return this.pedidoService.patch(id, dto);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.pedidoService.cancel(id);
  }

  @Post(':id/pagar')
  pagar(@Param('id') id: string) {
    return this.pedidoService.pagar(id);
  }

  @Post(':id/entregar')
  entregar(@Param('id') id: string) {
    return this.pedidoService.entregar(id);
  }
}
