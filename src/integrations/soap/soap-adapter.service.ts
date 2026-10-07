import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

type SoapSubmitResult = {
  trackingId: string;
  accepted: boolean;
};

@Injectable()
export class SoapAdapterService {
  private readonly logger = new Logger(SoapAdapterService.name);

  async submitInvoiceSoap(
    body: {
      documentId: string;
      customerIdentification: string;
      totalCop: number;
    },
    correlationId: string,
  ): Promise<SoapSubmitResult> {
    const xmlEnvelope = this.toSoapEnvelope(body);
    this.logger.log(
      `SOAP adapter interno ejecutado. correlationId=${correlationId} payloadLength=${xmlEnvelope.length}`,
    );

    return {
      trackingId: `soap-${randomUUID()}`,
      accepted: true,
    };
  }

  private toSoapEnvelope(input: {
    documentId: string;
    customerIdentification: string;
    totalCop: number;
  }): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fac="http://factus.local/soap">
  <soapenv:Header/>
  <soapenv:Body>
    <fac:SubmitInvoiceRequest>
      <fac:DocumentId>${input.documentId}</fac:DocumentId>
      <fac:CustomerIdentification>${input.customerIdentification}</fac:CustomerIdentification>
      <fac:TotalCop>${input.totalCop}</fac:TotalCop>
    </fac:SubmitInvoiceRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
  }
}
