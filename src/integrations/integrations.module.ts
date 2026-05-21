import { Module } from '@nestjs/common';
import { FactusAuthService } from './factus/factus-auth.service';
import { FactusService } from './factus/factus.service';
import { SoapAdapterService } from './soap/soap-adapter.service';

@Module({
  providers: [FactusAuthService, FactusService, SoapAdapterService],
  exports: [FactusAuthService, FactusService, SoapAdapterService],
})
export class IntegrationsModule {}
