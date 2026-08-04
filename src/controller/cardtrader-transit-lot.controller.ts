import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateCardtraderTransitLotDto,
  MarkNotArrivedDto,
  UpdateCardtraderTransitLotDto,
} from 'src/Dto/cardtrader-transit-lot.dto';
import { CardtraderTransitLotService } from 'src/service/cardtrader/cardtrader-transit-lot.service';
import { RequireFeature } from 'src/owner/feature-acl.guard';

@Controller('cardtrader/transit-lots')
@RequireFeature('cardtrader')
export class CardtraderTransitLotController {
  constructor(private readonly transitLotService: CardtraderTransitLotService) {}

  @Get('open/catalog')
  listOpenCatalog() {
    return this.transitLotService.listOpenCatalogLines();
  }

  @Get('open')
  listOpenLots() {
    return this.transitLotService.listOpenLots();
  }

  @Get('registered-package-keys')
  listRegisteredPackageKeys() {
    return this.transitLotService.listRegisteredPackageKeys();
  }

  @Post('mark-not-arrived')
  markNotArrived(@Body() body: MarkNotArrivedDto) {
    return this.transitLotService.markNotArrived(body);
  }

  @Post()
  createLot(@Body() body: CreateCardtraderTransitLotDto) {
    return this.transitLotService.createLot(body);
  }

  /** Vacía lotes y líneas de tránsito CardTrader (reimportación limpia). */
  @Delete()
  clearAllLots() {
    return this.transitLotService.clearAllLots();
  }

  @Get(':lotId')
  getLot(@Param('lotId') lotId: string) {
    return this.transitLotService.getLot(lotId);
  }

  @Get(':lotId/lines')
  listLotLines(@Param('lotId') lotId: string) {
    return this.transitLotService.listLotLines(lotId);
  }

  @Put(':lotId')
  updateLot(
    @Param('lotId') lotId: string,
    @Body() body: UpdateCardtraderTransitLotDto,
  ) {
    return this.transitLotService.updateLot(lotId, body);
  }

  @Delete(':lotId')
  deleteLot(@Param('lotId') lotId: string) {
    return this.transitLotService.deleteLot(lotId);
  }
}
