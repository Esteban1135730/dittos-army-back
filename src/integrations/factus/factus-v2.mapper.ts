import { CreateElectronicInvoiceDto } from './dto/create-electronic-invoice.dto';

const DOC_CODE: Record<string, string> = {
  CC: '13',
  CE: '22',
  NIT: '31',
  TI: '12',
  PP: '41',
};

/** Payload mínimo Factus API v2 `/v2/bills/validate`. */
export function toFactusReferenceCode(externalId: string): string {
  if (externalId.startsWith('ditto-')) return externalId.slice(0, 40);
  const slug = externalId.replace(/^inv-/, '').replace(/-/g, '').slice(0, 12);
  return `ditto-${slug}`;
}

export function mapToFactusV2Bill(
  dto: CreateElectronicInvoiceDto,
  referenceCode: string,
): Record<string, unknown> {
  const numberingRangeId = Number(
    process.env.FACTUS_NUMBERING_RANGE_ID || '389',
  );
  const ivaRate = process.env.FACTUS_IVA_RATE || '19.00';
  const isJuridica = dto.customerDocumentType === 'NIT';
  const ivaPercent = parseFloat(ivaRate) / 100;

  const roundCop = (n: number) => Math.round(n * 100) / 100;

  /** Factus espera `price` = precio unitario; el total de pago debe coincidir con ítems + IVA. */
  let grossTotal = 0;
  const items = dto.lines.map((line, index) => {
    const lineNet = roundCop(line.quantity * line.unitPriceCop);
    const lineTax = roundCop(lineNet * ivaPercent);
    const lineGross = roundCop(lineNet + lineTax);
    grossTotal = roundCop(grossTotal + lineGross);

    return {
      code_reference: `LINE-${index + 1}`,
      name: line.description,
      quantity: String(line.quantity),
      price: roundCop(line.unitPriceCop).toFixed(2),
      discount_rate: '0.00',
      unit_measure_code: '94',
      standard_code: '1',
      taxes: [{ code: '01', rate: ivaRate }],
    };
  });

  const identificationDocumentCode =
    DOC_CODE[dto.customerDocumentType || 'CC'] || '13';

  const customer: Record<string, string> = {
    identification_document_code: identificationDocumentCode,
    identification: dto.customerIdentification.replace(/\D/g, ''),
    legal_organization_code: isJuridica ? '1' : '2',
    tribute_code: 'ZZ',
    municipality_code: dto.customerMunicipalityCode || '11001',
  };

  if (isJuridica) {
    customer.company = dto.legalCompanyName || dto.customerName;
    if (dto.customerDv) customer.dv = dto.customerDv;
  } else {
    customer.names = dto.customerName;
  }

  if (dto.customerEmail) customer.email = dto.customerEmail;
  if (dto.customerPhone) customer.phone = dto.customerPhone;
  if (dto.customerAddress) customer.address = dto.customerAddress;

  const paymentForm = dto.paymentMethod?.toLowerCase().includes('crédito')
    ? '2'
    : '1';

  const bill: Record<string, unknown> = {
    reference_code: referenceCode,
    numbering_range_id: numberingRangeId,
    send_email: false,
    observation: dto.notes?.slice(0, 250),
    customer,
    items,
    payment_details: [
      {
        payment_form: paymentForm,
        payment_method_code: '10',
        amount: grossTotal.toFixed(2),
        ...(paymentForm === '2' && dto.paymentDueDate
          ? { due_date: dto.paymentDueDate }
          : {}),
      },
    ],
  };

  if (dto.referenceOrder) {
    bill.order_reference = {
      reference_code: dto.referenceOrder.slice(0, 50),
    };
  }

  return bill;
}

