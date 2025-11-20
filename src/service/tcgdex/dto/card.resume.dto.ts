import { CardResume } from '@tcgdex/sdk';

export type CardResumeDto = {
  id: string;
  localId: string;
  name: string;
  image?: string;
};

export function mapCardResume(src: any) {
  return {
    id: src.id,
    localId: src.localId,
    name: src.name,
    image: src.getImageURL('low', 'png'),
  };
}
