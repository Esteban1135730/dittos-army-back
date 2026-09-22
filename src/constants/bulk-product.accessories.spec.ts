import {
  ACCESSORY_DEFAULT_PVP_COP,
  DOMICILIO_CARD_ID,
  DOMICILIO_CARD_NAME,
  ENVIO_CARD_ID,
  ENVIO_CARD_NAME,
  isSyntheticQuantityCardId,
  isZeroProfitCardId,
  PABLO_ACCESSORY_SKUS,
  PROTECCION_CARTAS_CARD_ID,
  PROTECCION_CARTAS_CARD_NAME,
} from './bulk-product';

describe('PABLO_ACCESSORY_SKUS', () => {
  it('define envio, domicilio y proteccion de cartas con PVP 0', () => {
    expect(PABLO_ACCESSORY_SKUS).toEqual([
      {
        card_id: ENVIO_CARD_ID,
        card_name: ENVIO_CARD_NAME,
        pvp_cop: ACCESSORY_DEFAULT_PVP_COP,
      },
      {
        card_id: DOMICILIO_CARD_ID,
        card_name: DOMICILIO_CARD_NAME,
        pvp_cop: ACCESSORY_DEFAULT_PVP_COP,
      },
      {
        card_id: PROTECCION_CARTAS_CARD_ID,
        card_name: PROTECCION_CARTAS_CARD_NAME,
        pvp_cop: ACCESSORY_DEFAULT_PVP_COP,
      },
    ]);
    expect(ACCESSORY_DEFAULT_PVP_COP).toBe(0);
    expect(ENVIO_CARD_NAME).toBe('envio');
    expect(DOMICILIO_CARD_NAME).toBe('domicilio');
    expect(PROTECCION_CARTAS_CARD_NAME).toBe('proteccion de cartas');
    expect(isSyntheticQuantityCardId(ENVIO_CARD_ID)).toBe(true);
    expect(isSyntheticQuantityCardId(DOMICILIO_CARD_ID)).toBe(true);
    expect(isSyntheticQuantityCardId(PROTECCION_CARTAS_CARD_ID)).toBe(true);
    expect(isSyntheticQuantityCardId('es-figura-3d-pequena')).toBe(true);
    expect(isSyntheticQuantityCardId('es-carta-tejida')).toBe(true);
    expect(isSyntheticQuantityCardId('swsh3-136')).toBe(false);
    expect(isZeroProfitCardId(ENVIO_CARD_ID)).toBe(true);
    expect(isZeroProfitCardId(DOMICILIO_CARD_ID)).toBe(false);
    expect(isZeroProfitCardId('swsh3-136')).toBe(false);
  });
});
