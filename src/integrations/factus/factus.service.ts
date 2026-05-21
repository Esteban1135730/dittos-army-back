import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateElectronicInvoiceDto } from './dto/create-electronic-invoice.dto';
import { FactusAuthService } from './factus-auth.service';
import {
  mapToFactusV2Bill,
  toFactusReferenceCode,
} from './factus-v2.mapper';

type FactusSubmitResponse = {
  providerDocumentId: string;
  providerStatus: 'submitted' | 'accepted';
  factusNumber?: string;
  validationMessage?: string;
};

@Injectable()
export class FactusService {
  private readonly logger = new Logger(FactusService.name);

  constructor(private readonly factusAuth: FactusAuthService) {}

  private get baseUrl(): string {
    return process.env.FACTUS_BASE_URL || 'https://api-sandbox.factus.com.co';
  }

  async submitInvoice(
    payload: CreateElectronicInvoiceDto,
    correlationId: string,
    externalId?: string,
  ): Promise<FactusSubmitResponse> {
    const token = await this.factusAuth.getAccessToken();
    if (!token) {
      this.logger.warn(
        `Factus sin credenciales, respuesta simulada. correlationId=${correlationId}`,
      );
      return {
        providerDocumentId: `factus-mock-${randomUUID()}`,
        providerStatus: 'submitted',
      };
    }

    const referenceCode = externalId
      ? toFactusReferenceCode(externalId)
      : toFactusReferenceCode(`inv-${randomUUID()}`);
    const body = mapToFactusV2Bill(payload, referenceCode);

    const response = await fetch(`${this.baseUrl}/v2/bills/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    if (!response.ok) {
      this.logger.error(
        `Factus validate fallo status=${response.status} body=${responseText}`,
      );
      let detail = 'No fue posible validar la factura en Factus';
      try {
        const errJson = JSON.parse(responseText) as {
          message?: string;
          data?: { message?: string; errors?: Record<string, string[]> };
        };
        const parts: string[] = [];
        if (errJson.message) parts.push(errJson.message);
        if (errJson.data?.message) parts.push(errJson.data.message);
        const fieldErrors = errJson.data?.errors;
        if (fieldErrors) {
          for (const [field, msgs] of Object.entries(fieldErrors)) {
            parts.push(`${field}: ${msgs.join(', ')}`);
          }
        }
        if (parts.length) detail = parts.join(' — ');
      } catch {
        /* keep default */
      }
      throw new Error(detail);
    }

    const json = JSON.parse(responseText) as {
      status?: string;
      message?: string;
      data?: {
        reference_code?: string;
        number?: string;
        is_validated?: boolean;
      };
    };

    const ref = json.data?.reference_code || referenceCode;
    const validated = json.data?.is_validated === true;

    return {
      providerDocumentId: ref,
      providerStatus: validated ? 'accepted' : 'submitted',
      factusNumber: json.data?.number,
      validationMessage: json.message,
    };
  }

  async getInvoiceStatus(
    referenceCode: string,
    correlationId: string,
    factusBillNumber?: string,
  ): Promise<{
    providerStatus: 'submitted' | 'accepted' | 'rejected';
    factusNumber?: string;
  }> {
    const token = await this.factusAuth.getAccessToken();
    if (!token) {
      return { providerStatus: 'submitted' };
    }

    const billNumber = await this.resolveFactusBillNumber(
      referenceCode,
      factusBillNumber,
      token,
      correlationId,
    );

    const response = await fetch(
      `${this.baseUrl}/v2/bills/${encodeURIComponent(billNumber)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'x-correlation-id': correlationId,
        },
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      this.logger.error(
        `Factus consulta fallo status=${response.status} body=${responseText}`,
      );
      throw new Error(this.parseFactusErrorMessage(responseText));
    }

    const json = JSON.parse(responseText) as {
      data?: { is_validated?: boolean; status?: string | number };
    };
    const providerStatus = this.mapFactusBillStatus(json.data);
    return { providerStatus, factusNumber: billNumber };
  }

  private mapFactusBillStatus(
    data?: { is_validated?: boolean; status?: string | number },
  ): 'submitted' | 'accepted' | 'rejected' {
    if (data?.is_validated) return 'accepted';
    if (data?.status === 'rejected') return 'rejected';
    return 'submitted';
  }

  private parseFactusErrorMessage(responseText: string): string {
    let detail = 'No fue posible consultar el estado en Factus';
    try {
      const errJson = JSON.parse(responseText) as { message?: string };
      if (errJson.message) detail = errJson.message;
    } catch {
      /* keep default */
    }
    return detail;
  }

  /** GET /v2/bills/:number usa el consecutivo Factus, no el reference_code ditto-*. */
  private async resolveFactusBillNumber(
    referenceCode: string,
    factusBillNumber: string | undefined,
    token: string,
    correlationId: string,
  ): Promise<string> {
    if (factusBillNumber?.trim()) {
      return factusBillNumber.trim();
    }

    const listUrl = `${this.baseUrl}/v2/bills?filter[reference_code]=${encodeURIComponent(referenceCode)}`;
    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'x-correlation-id': correlationId,
      },
    });

    const listText = await listResponse.text();
    if (!listResponse.ok) {
      this.logger.error(
        `Factus listar por referencia fallo status=${listResponse.status} body=${listText}`,
      );
      throw new Error(this.parseFactusErrorMessage(listText));
    }

    const listJson = JSON.parse(listText) as {
      data?: { data?: Array<{ number?: string }> };
    };
    const items = listJson.data?.data;
    const number = items?.[0]?.number;
    if (!number) {
      throw new Error(
        `No se encontró factura en Factus con referencia ${referenceCode}`,
      );
    }
    return String(number);
  }
}
