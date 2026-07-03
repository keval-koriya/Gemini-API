import { GRPC } from '../constants.js';
import { Gem, GemJar } from '../types/gem.js';
import { APIError } from '../exceptions.js';
import { getNestedValue } from '../utils/parsing.js';
import { logger } from '../utils/logger.js';

export class GemMixin {
    _gems: GemJar | null = null;
    _batchExecute: (payloads: any[], kwargs?: any) => Promise<any>;
    language: string = "en";
    close: () => Promise<void>;

    constructor() {
        this._batchExecute = async () => { throw new Error("Not implemented in Mixin"); };
        this.close = async () => { throw new Error("Not implemented in Mixin"); };
    }

    get gems(): GemJar {
        if (this._gems === null) {
            throw new Error("Gems not fetched yet. Call `GeminiClient.fetchGems()` method to fetch gems from gemini.google.com.");
        }
        return this._gems;
    }

    async fetchGems(includeHidden: boolean = false, kwargs: any = {}): Promise<GemJar> {
        const payload1 = includeHidden ? `[4,['${this.language}'],0]` : `[3,['${this.language}'],0]`;
        const payload2 = `[2,['${this.language}'],0]`;

        const response = await this._batchExecute([
            { rpcid: GRPC.LIST_GEMS, payload: payload1, identifier: "system" },
            { rpcid: GRPC.LIST_GEMS, payload: payload2, identifier: "custom" }
        ], kwargs);

        try {
            let parts: any[];
            let text = response.data;
            if (text.startsWith(")]}'")) text = text.substring(4).trim();
            parts = JSON.parse(text);

            let predefinedGems: any[] = [];
            let customGems: any[] = [];

            for (const part of parts) {
                try {
                    const identifier = getNestedValue(part, [part.length - 1]);
                    const partBodyStr = getNestedValue(part, [2]);
                    if (!partBodyStr) continue;

                    const partBody = JSON.parse(partBodyStr);
                    if (identifier === "system") {
                        predefinedGems = getNestedValue(partBody, [2], []);
                    } else if (identifier === "custom") {
                        customGems = getNestedValue(partBody, [2], []);
                    }
                } catch (e) {
                    continue;
                }
            }

            if (predefinedGems.length === 0 && customGems.length === 0) {
                throw new Error();
            }

            this._gems = new GemJar();
            for (const gem of predefinedGems) {
                const id = gem[0];
                const name = gem[1][0];
                const desc = gem[1][1];
                const prompt = gem[2] && gem[2][0] ? gem[2][0] : null;
                this._gems.set(id, new Gem(id, name, true, desc, prompt));
            }

            for (const gem of customGems) {
                const id = gem[0];
                const name = gem[1][0];
                const desc = gem[1][1];
                const prompt = gem[2] && gem[2][0] ? gem[2][0] : null;
                this._gems.set(id, new Gem(id, name, false, desc, prompt));
            }

            return this._gems;
        } catch (e) {
            await this.close();
            logger.debug(`Unexpected response data structure: ${response.data}`);
            throw new APIError("Failed to fetch gems. Unexpected response data structure. Client will try to re-initialize on next request.");
        }
    }

    async createGem(name: string, prompt: string, description: string = ""): Promise<Gem> {
        const payload = JSON.stringify([
            [name, description, prompt, null, null, null, null, null, 0, null, 1, null, null, null, []]
        ]);

        const response = await this._batchExecute([
            { rpcid: GRPC.CREATE_GEM, payload: payload, identifier: "generic" }
        ]);

        try {
            let parts: any[];
            let text = response.data;
            if (text.startsWith(")]}'")) text = text.substring(4).trim();
            parts = JSON.parse(text);

            const partBodyStr = getNestedValue(parts, [0, 2]);
            if (!partBodyStr) throw new Error();

            const partBody = JSON.parse(partBodyStr);
            const gemId = getNestedValue(partBody, [0]);
            if (!gemId) throw new Error();

            return new Gem(gemId, name, false, description, prompt);
        } catch (e) {
            await this.close();
            logger.debug(`Unexpected response data structure: ${response.data}`);
            throw new APIError("Failed to create gem. Unexpected response data structure. Client will try to re-initialize on next request.");
        }
    }

    async updateGem(gem: Gem | string, name: string, prompt: string, description: string = ""): Promise<Gem> {
        const gemId = typeof gem === 'string' ? gem : gem.id;
        const payload = JSON.stringify([
            gemId,
            [name, description, prompt, null, null, null, null, null, 0, null, 1, null, null, null, [], 0]
        ]);

        await this._batchExecute([
            { rpcid: GRPC.UPDATE_GEM, payload: payload, identifier: "generic" }
        ]);

        return new Gem(gemId, name, false, description, prompt);
    }

    async deleteGem(gem: Gem | string, kwargs: any = {}): Promise<void> {
        const gemId = typeof gem === 'string' ? gem : gem.id;
        await this._batchExecute([
            { rpcid: GRPC.DELETE_GEM, payload: JSON.stringify([gemId]), identifier: "generic" }
        ], kwargs);
    }
}
