import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FactusService } from 'src/integrations/factus/factus.service';
import { CreateElectronicInvoiceDto } from 'src/integrations/factus/dto/create-electronic-invoice.dto';
import { SoapAdapterService } from 'src/integrations/soap/soap-adapter.service';
import { ElectronicInvoiceRepository } from 'src/repository/electronic-invoice.repository';

@Injectable()
export class BillingFactusService {
  constructor(
    private readonly factusService: FactusService,
    private readonly soapAdapterService: SoapAdapterService,
    private readonly electronicInvoiceRepository: ElectronicInvoiceRepository,
  ) {}

  async createDraft(dto: CreateElectronicInvoiceDto) {
    const totalCop = dto.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPriceCop,
      0,
    );

    return this.electronicInvoiceRepository.create({
      external_id: `inv-${randomUUID()}`,
      customer_name: dto.customerName,
      customer_identification: dto.customerIdentification,
      lines: dto.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceCop: l.unitPriceCop,
      })),
      total_cop: totalCop,
      status: 'draft',
      customer_document_type: dto.customerDocumentType,
      customer_dv: dto.customerDv,
      legal_company_name: dto.legalCompanyName,
      customer_email: dto.customerEmail,
      customer_phone: dto.customerPhone,
      customer_address: dto.customerAddress,
      customer_city: dto.customerCity,
      customer_department: dto.customerDepartment,
      customer_municipality_code: dto.customerMunicipalityCode,
      tax_responsibility: dto.taxResponsibility,
      payment_method: dto.paymentMethod,
      payment_due_date: dto.paymentDueDate,
      reference_order: dto.referenceOrder,
      internal_reference: dto.internalReference,
      notes: dto.notes,
    });
  }

  async sendInvoice(invoiceId: string, correlationId: string) {
    const invoice = await this.electronicInvoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new Error('Factura no encontrada');
    }

    const linePayload =
      invoice.lines?.length > 0
        ? invoice.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPriceCop: l.unitPriceCop,
          }))
        : [
            {
              description: 'Factura consolidada',
              quantity: 1,
              unitPriceCop: invoice.total_cop,
            },
          ];

    const submitResult = await this.factusService.submitInvoice(
      {
        customerName: invoice.customer_name,
        customerIdentification: invoice.customer_identification,
        lines: linePayload,
        notes: invoice.notes,
        customerDocumentType: invoice.customer_document_type,
        customerDv: invoice.customer_dv,
        legalCompanyName: invoice.legal_company_name,
        customerEmail: invoice.customer_email,
        customerPhone: invoice.customer_phone,
        customerAddress: invoice.customer_address,
        customerCity: invoice.customer_city,
        customerDepartment: invoice.customer_department,
        customerMunicipalityCode: invoice.customer_municipality_code,
        taxResponsibility: invoice.tax_responsibility,
        paymentMethod: invoice.payment_method,
        paymentDueDate: invoice.payment_due_date,
        referenceOrder: invoice.reference_order,
        internalReference: invoice.internal_reference,
      },
      correlationId,
    );

    const soapResult = await this.soapAdapterService.submitInvoiceSoap(
      {
        documentId: submitResult.providerDocumentId,
        customerIdentification: invoice.customer_identification,
        totalCop: invoice.total_cop,
      },
      correlationId,
    );

    return this.electronicInvoiceRepository.updateById(invoiceId, {
      factus_document_id: submitResult.providerDocumentId,
      soap_tracking_id: soapResult.trackingId,
      status: submitResult.providerStatus,
      error_message: undefined,
    });
  }

  async checkStatus(invoiceId: string, correlationId: string) {
    const invoice = await this.electronicInvoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new Error('Factura no encontrada');
    }

    if (!invoice.factus_document_id) {
      return invoice;
    }

    const providerStatus = await this.factusService.getInvoiceStatus(
      invoice.factus_document_id,
      correlationId,
    );

    return this.electronicInvoiceRepository.updateById(invoiceId, {
      status: providerStatus,
    });
  }
}
