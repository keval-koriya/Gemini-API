import { GeminiClient, Model } from '../src/index.js';

describe('GeminiClient', () => {
    it('should initialize correctly', () => {
        const client = new GeminiClient();
        expect(client).toBeDefined();
        expect(client.language).toBe('en');
    });

    it('Model static properties should exist', () => {
        expect(Model.BASIC_FLASH).toBeDefined();
        expect(Model.PLUS_PRO).toBeDefined();
    });
});
