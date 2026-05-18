import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ElectronicInvoiceDocument = HydratedDocument<ElectronicInvoice>;

const InvoiceLineSchema = new MongooseSchema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPriceCop: { type: Number, required: true },
  },
  { _id: false },
);

@Schema()
export class ElectronicInvoice {
  @Prop({ required: true })
  external_id: string;

  @Prop({ required: true })
  customer_name: string;

  @Prop({ required: true })
  customer_identification: string;

  @Prop({ type: [InvoiceLineSchema], default: [] })
  lines: Array<{ description: string; quantity: number; unitPriceCop: number }>;

  @Prop({ required: true })
  total_cop: number;

  @Prop({ required: true, enum: ['draft', 'submitted', 'accepted', 'rejected'] })
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';

  @Prop()
  customer_document_type?: string;

  @Prop()
  customer_dv?: string;

  @Prop()
  legal_company_name?: string;

  @Prop()
  customer_email?: string;

  @Prop()
  customer_phone?: string;

  @Prop()
  customer_address?: string;

  @Prop()
  customer_city?: string;

  @Prop()
  customer_department?: string;

  @Prop()
  customer_municipality_code?: string;

  @Prop()
  tax_responsibility?: string;

  @Prop()
  payment_method?: string;

  @Prop()
  payment_due_date?: string;

  @Prop()
  reference_order?: string;

  @Prop()
  internal_reference?: string;

  @Prop()
  notes?: string;

  @Prop()
  factus_document_id?: string;

  @Prop()
  soap_tracking_id?: string;

  @Prop()
  error_message?: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const ElectronicInvoiceSchema = SchemaFactory.createForClass(ElectronicInvoice);
