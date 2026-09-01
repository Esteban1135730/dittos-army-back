import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PedidoCreateDto, PedidoPatchDto } from 'src/Dto/pedido.dto';
import { RequireFeature } from 'src/owner/feature-acl.guard';
import { EnvioGeocodeService } from 'src/service/envio-geocode.service';
import { PedidoService } from 'src/service/pedido.service';

@Controller('pedido')
@RequireFeature('clientes')
export class PedidoController {
  constructor(
    private readonly pedidoService: PedidoService,
    private readonly envioGeocode: EnvioGeocodeService,
  ) {}

  @Get('tiendas')
  listTiendas() {
    return this.pedidoService.listTiendas();
  }

  @Get('client/:clientId')
  listByClient(@Param('clientId') clientId: string) {
    return this.pedidoService.listByClient(clientId);
  }

  @Get('calendario')
  listCalendario(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.pedidoService.listCalendario(from, to);
  }

  @Get('geocode')
  async geocode(@Query('q') q?: string) {
    const point = await this.envioGeocode.geocodeIfBogota(q);
    if (!point) {
      return { ok: false as const, lat: null, lng: null };
    }
    return { ok: true as const, lat: point.lat, lng: point.lng };
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
