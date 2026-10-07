import { Injectable } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { ClientRepository } from 'src/repository/client.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { ReservaDocument } from 'src/schema/reserva.schema';
import { StockDocument } from 'src/schema/stock.schema';
import { SaleDocument } from 'src/schema/sale.schema';

export type BillableItemDto = {
  key: string;
  source: 'reserva' | 'venta';
  sourceId: string;
  stockId: string;
  cardId: string;
  cardName: string;
  variant?: string;
  amountCop: number;
  currencyLabel?: string;
  createdAt?: string;
};

function precioToCop(precio: number, currency: string): number {
  if (currency === 'COP') return Math.round(precio);
  if (currency === 'EUR') {
    const rate = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
    return Math.round(precio * rate);
  }
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_COP || '0') || 4500;
    return Math.round(precio * rate);
  }
  return Math.round(precio);
}

function stockLabel(stock: StockDocument): { name: string; variant?: string } {
  const name = stock.card_name?.trim() || stock.card_id || 'Carta';
  const parts: string[] = [];
  if (stock.rareza) parts.push(String(stock.rareza));
  if (stock.holofoil) parts.push('holo');
  if (stock.league_card) parts.push('league');
  return { name, variant: parts.length ? parts.join(' · ') : undefined };
}

@Injectable()
export class BillingBillableItemsService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly saleRepository: SaleRepository,
    private readonly stockRepository: StockRepository,
  ) {}

  async listForClient(clientId: string): Promise<BillableItemDto[]> {
    if (!isValidObjectId(clientId)) {
      throw new Error('clientId inválido');
    }
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new Error('Cliente no encontrado');
    }

    const items: BillableItemDto[] = [];
    const seenStock = new Set<string>();

    const reservas = await this.reservaRepository.findByClientId(clientId);
    for (const reserva of reservas as ReservaDocument[]) {
      const stock = await this.stockRepository.findById(reserva.stock_id);
      if (!stock) continue;
      const { name, variant } = stockLabel(stock as StockDocument);
      const amountCop = precioToCop(reserva.precio, reserva.currency ?? 'COP');
      items.push({
        key: `reserva:${reserva._id}`,
        source: 'reserva',
        sourceId: String(reserva._id),
        stockId: reserva.stock_id,
        cardId: stock.card_id,
        cardName: name,
        variant,
        amountCop,
        currencyLabel: reserva.currency ?? 'COP',
        createdAt: reserva.created_at?.toISOString?.() ?? undefined,
      });
      seenStock.add(reserva.stock_id);
    }

    const ventas = await this.saleRepository.findVentasByClientId(clientId, {
      limit: 100,
    });
    for (const venta of ventas as SaleDocument[]) {
      if (seenStock.has(venta.stock_id)) continue;
      const stock = await this.stockRepository.findById(venta.stock_id);
      if (!stock) continue;
      const { name, variant } = stockLabel(stock as StockDocument);
      items.push({
        key: `venta:${venta._id}`,
        source: 'venta',
        sourceId: String(venta._id),
        stockId: venta.stock_id,
        cardId: venta.card_id,
        cardName: name,
        variant,
        amountCop: venta.amount_cop,
        currencyLabel: 'COP',
        createdAt: venta.created_at?.toISOString?.() ?? undefined,
      });
      seenStock.add(venta.stock_id);
    }

    items.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'reserva' ? -1 : 1;
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    return items;
  }
}
