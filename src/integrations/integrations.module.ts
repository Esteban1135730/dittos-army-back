import { Module } from '@nestjs/common';
import { FactusService } from './factus/factus.service';
import { SoapAdapterService } from './soap/soap-adapter.service';

@Module({
  providers: [FactusService, SoapAdapterService],
  exports: [FactusService, SoapAdapterService],
})
export class IntegrationsModule {}
