import { mapToFactusV2Bill } from './factus-v2.mapper';
import { CreateElectronicInvoiceDto } from './dto/create-electronic-invoice.dto';

describe('mapToFactusV2Bill', () => {
  const baseDto: CreateElectronicInvoiceDto = {
    customerName: 'Cliente Prueba',
    customerIdentification: '1234567890',
    customerDocumentType: 'CC',
    customerMunicipalityCode: '11001',
    lines: [{ description: 'Item', quantity: 1, unitPriceCop: 10000 }],
  };

  it('usa precio unitario en items (no total de línea)', () => {
    const dto: CreateElectronicInvoiceDto = {
      ...baseDto,
      lines: [{ description: 'Item', quantity: 2, unitPriceCop: 5000 }],
    };
    const bill = mapToFactusV2Bill(dto, 'ditto-test') as {
      items: { price: string; quantity: string }[];
      payment_details: { amount: string }[];
    };
    expect(bill.items[0].price).toBe('5000.00');
    expect(bill.items[0].quantity).toBe('2');
    expect(bill.payment_details[0].amount).toBe('11900.00');
  });

  it('iguala monto de pago al total con IVA para una línea', () => {
    const bill = mapToFactusV2Bill(baseDto, 'ditto-test') as {
      payment_details: { amount: string }[];
    };
    expect(bill.payment_details[0].amount).toBe('11900.00');
  });
});
