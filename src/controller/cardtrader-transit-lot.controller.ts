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
  UpdateCardtraderTransitLotDto,
} from 'src/Dto/cardtrader-transit-lot.dto';
import { CardtraderTransitLotService } from 'src/service/cardtrader/cardtrader-transit-lot.service';

@Controller('cardtrader/transit-lots')
export class CardtraderTransitLotController {
  constructor(private readonly transitLotService: CardtraderTransitLotService) {}

  @Get('open')
  listOpenLots() {
    return this.transitLotService.listOpenLots();
  }

  @Get('registered-package-keys')
  listRegisteredPackageKeys() {
    return this.transitLotService.listRegisteredPackageKeys();
  }

  @Post()
  createLot(@Body() body: CreateCardtraderTransitLotDto) {
    return this.transitLotService.createLot(body);
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
