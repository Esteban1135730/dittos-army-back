export type InvoiceLineDto = {
  description: string;
  quantity: number;
  unitPriceCop: number;
};

/** Payload para crear borrador y para enviar a Factus (campos alineados a datos típicos DIAN / cliente). */
export type CreateElectronicInvoiceDto = {
  customerName: string;
  customerIdentification: string;
  lines: InvoiceLineDto[];
  notes?: string;
  /** CC, CE, NIT, TI, PP, etc. */
  customerDocumentType?: string;
  /** Dígito de verificación si aplica (NIT). */
  customerDv?: string;
  /** Razón social si es persona jurídica. */
  legalCompanyName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  customerDepartment?: string;
  /** Municipio DIAN si lo separas del campo ciudad. */
  customerMunicipalityCode?: string;
  /** Responsabilidad fiscal / régimen (texto libre o código interno). */
  taxResponsibility?: string;
  paymentMethod?: string;
  paymentDueDate?: string;
  referenceOrder?: string;
  internalReference?: string;
};
