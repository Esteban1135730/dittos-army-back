"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mapper = void 0;
const _ = require("lodash");
class Mapper {
    static toCleanObject(obj) {
        const seen = new WeakSet();
        return _.cloneDeepWith(obj, (value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return undefined;
                }
                seen.add(value);
            }
            if (typeof value === 'function' && value !== null) {
                return undefined;
            }
            return undefined;
        });
    }
}
exports.Mapper = Mapper;
//# sourceMappingURL=mapper.js.map