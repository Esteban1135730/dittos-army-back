import { ClientDto } from 'src/Dto/client.dto';

/** Devuelve mensaje de error o `null` si el contacto del DTO es válido. */
export function getClientContactValidationError(dto: ClientDto): string | null {
  if (dto.metodo_contacto === 'facebook') {
    const u = dto.facebook_usuario?.trim();
    if (!u) {
      return 'facebook_usuario es requerido cuando metodo_contacto es facebook';
    }
  }
  return null;
}
