import * as _ from 'lodash';

export class Mapper {
  static toCleanObject<T extends object>(obj: T): T {
    const seen = new WeakSet();

    return _.cloneDeepWith(obj, (value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return undefined; // Elimina referencia circular
        }
        seen.add(value);
      }
      if (typeof value === 'function' && value !== null) {
        return undefined;
      }
      return undefined; // sigue clonando normalmente
    });
  }
}
