export function precioToCop(precio: number, currency: string): number {
  if (currency === 'COP') return precio;
  if (currency === 'EUR') {
    const rate = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
    return Math.round(precio * rate);
  }
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_COP || '0') || 4500;
    return Math.round(precio * rate);
  }
  return precio;
}
