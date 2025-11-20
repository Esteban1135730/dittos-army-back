import { SetResume } from '@tcgdex/sdk';
import _ from 'lodash';

export type SetResumeDto = {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount: {
    total: number;

    official: number;
  };
};

export function mapSetResume(src: SetResume): SetResumeDto {
  return {
    id: src.id,
    name: src.name,
    logo: src.logo,
    symbol: src.symbol,
    cardCount: src.cardCount,
  };
}
