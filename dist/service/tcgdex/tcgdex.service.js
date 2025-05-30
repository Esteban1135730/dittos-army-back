"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TCGDexService = void 0;
const common_1 = require("@nestjs/common");
const pokemon_tcg_sdk_typescript_1 = require("pokemon-tcg-sdk-typescript");
let TCGDexService = class TCGDexService {
    async getSets() {
        return await pokemon_tcg_sdk_typescript_1.PokemonTCG.getAllSets();
    }
    async getSetCards(setId) {
        const paramsV2 = { q: `set.id:${setId}` };
        return await pokemon_tcg_sdk_typescript_1.PokemonTCG.findCardsByQueries(paramsV2);
    }
    async getCard(id) {
        return await pokemon_tcg_sdk_typescript_1.PokemonTCG.findCardByID(id);
    }
};
exports.TCGDexService = TCGDexService;
exports.TCGDexService = TCGDexService = __decorate([
    (0, common_1.Injectable)()
], TCGDexService);
//# sourceMappingURL=tcgdex.service.js.map