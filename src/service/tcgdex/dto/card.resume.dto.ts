import { sanitizeCardImageUrl } from '../../../utils/card-image-url';

export type CardResumeDto = {
  id: string;
  localId: string;
  name: string;
  image?: string;
};

export function mapCardResume(src: any) {
  const rawImage =
    typeof src?.image === 'string' && src.image.trim()
      ? src.getImageURL?.('low', 'png')
      : '';
  return {
    id: src.id,
    localId: src.localId,
    name: src.name,
    image: sanitizeCardImageUrl(rawImage) || undefined,
  };
}
