import { toStorePublicTags } from './store-public-tags';

describe('toStorePublicTags', () => {
  it('solo publica vintage y jugable', () => {
    expect(toStorePublicTags(['bulk', 'vintage', 'brillo', 'jugable'])).toEqual([
      'vintage',
      'jugable',
    ]);
  });

  it('omite array vacío', () => {
    expect(toStorePublicTags(['bulk'])).toBeUndefined();
    expect(toStorePublicTags([])).toBeUndefined();
  });
});
