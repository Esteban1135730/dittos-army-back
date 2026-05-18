import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateElectronicInvoiceDto } from './dto/create-electronic-invoice.dto';

type FactusSubmitResponse = {
  providerDocumentId: string;
  providerStatus: 'submitted' | 'accepted';
};

@Injectable()
export class FactusService {
  private readonly logger = new Logger(FactusService.name);

  private get baseUrl(): string {
    return process.env.FACTUS_BASE_URL || 'https://api-sandbox.factus.com.co';
  }

  private get apiToken(): string | undefined {
    return process.env.FACTUS_API_TOKEN;
  }

  async submitInvoice(
    payload: CreateElectronicInvoiceDto,
    correlationId: string,
  ): Promise<FactusSubmitResponse> {
    if (!this.apiToken) {
      this.logger.warn(
        `Factus token no configurado, usando respuesta simulada. correlationId=${correlationId}`,
      );
      return {
        providerDocumentId: `factus-mock-${randomUUID()}`,
        providerStatus: 'submitted',
      };
    }

    const response = await fetch(`${this.baseUrl}/v1/bills/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Error al enviar factura a Factus. status=${response.status} body=${errorBody}`,
      );
      throw new Error('No fue posible enviar la factura a Factus');
    }

    const json = (await response.json()) as { id?: string; status?: string };
    return {
      providerDocumentId: json.id || `factus-${randomUUID()}`,
      providerStatus: json.status === 'accepted' ? 'accepted' : 'submitted',
    };
  }

  async getInvoiceStatus(
    providerDocumentId: string,
    correlationId: string,
  ): Promise<'submitted' | 'accepted' | 'rejected'> {
    if (!this.apiToken) {
      this.logger.warn(
        `Factus token no configurado, estado simulado submitted. correlationId=${correlationId}`,
      );
      return 'submitted';
    }

    const response = await fetch(
      `${this.baseUrl}/v1/bills/${encodeURIComponent(providerDocumentId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'x-correlation-id': correlationId,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Error consultando estado en Factus. status=${response.status} body=${errorBody}`,
      );
      throw new Error('No fue posible consultar el estado en Factus');
    }

    const json = (await response.json()) as { status?: string };
    if (json.status === 'accepted') return 'accepted';
    if (json.status === 'rejected') return 'rejected';
    return 'submitted';
  }
}
