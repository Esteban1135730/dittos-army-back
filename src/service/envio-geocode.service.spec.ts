import { BadRequestException } from '@nestjs/common';
import { EnvioGeocodeService } from './envio-geocode.service';

describe('EnvioGeocodeService', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalKey;
    }
  });

  it('q corto → 400', async () => {
    const svc = new EnvioGeocodeService();
    await expect(svc.geocodeIfBogota('ab')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Google: usa coincidencia en Bogotá y no llama Nominatim', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Unicentro, Medellín, Colombia',
            geometry: { location: { lat: 6.24, lng: -75.57 } },
          },
          {
            formatted_address: 'Unicentro, Bogotá, Colombia',
            geometry: { location: { lat: 4.686, lng: -74.042 } },
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new EnvioGeocodeService();
    const point = await svc.geocodeIfBogota('Unicentro');
    expect(point).toEqual({ lat: 4.686, lng: -74.042 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('maps.googleapis.com');
  });

  it('Google encuentra solo otra ciudad → null sin Nominatim', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const elsewhere = {
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Parque Lleras, Medellín, Colombia',
            geometry: { location: { lat: 6.21, lng: -75.57 } },
          },
        ],
      }),
    };
    const fetchMock = jest.fn().mockResolvedValue(elsewhere);
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new EnvioGeocodeService();
    await expect(svc.geocodeIfBogota('Parque Lleras')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('geocode');
    expect(String(fetchMock.mock.calls[1][0])).toContain('place/textsearch');
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim')),
    ).toBe(false);
  });

  it('misma consulta concurrente → una sola cadena de fetch; luego sale de caché', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const fetchMock = jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return {
        ok: true,
        json: async () => [
          { lat: '4.65', lon: '-74.08', display_name: 'Calle 100, Bogotá' },
        ],
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new EnvioGeocodeService();
    const [a, b] = await Promise.all([
      svc.geocodeIfBogota('Calle 100 #15-20'),
      svc.geocodeIfBogota('Calle 100   #15-20'),
    ]);
    expect(a).toEqual({ lat: 4.65, lng: -74.08 });
    expect(b).toEqual(a);
    await svc.geocodeIfBogota('Calle 100 #15-20');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it('sin clave Google: Nominatim solo si el hit es Bogotá', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: '4.65',
          lon: '-74.08',
          display_name: 'Calle 100, Bogotá, Colombia',
        },
      ],
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new EnvioGeocodeService();
    const point = await svc.geocodeIfBogota('Calle 100 #15-20');
    expect(point).toEqual({ lat: 4.65, lng: -74.08 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('nominatim');
  });
});
