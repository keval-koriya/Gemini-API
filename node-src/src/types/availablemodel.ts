import { buildModelHeader, MODEL_HEADER_KEY, Model } from '../constants.js';
import { getNestedValue } from '../utils/parsing.js';

export class AvailableModel {
    modelId: string;
    modelName: string;
    displayName: string;
    description: string;
    capacity: number;
    capacityField: number;
    isAvailable: boolean;

    constructor(
        modelId: string,
        modelName: string,
        displayName: string,
        description: string,
        capacity: number,
        capacityField: number = 12,
        isAvailable: boolean = true
    ) {
        this.modelId = modelId;
        this.modelName = modelName;
        this.displayName = displayName;
        this.description = description;
        this.capacity = capacity;
        this.capacityField = capacityField;
        this.isAvailable = isAvailable;
    }

    toString(): string {
        return this.modelName || this.displayName;
    }

    get modelHeader(): Record<string, string> {
        let tail: string | number;
        if (this.capacityField === 13) {
            tail = `null,${this.capacity}`;
        } else {
            tail = this.capacity;
        }
        return buildModelHeader(this.modelId, tail);
    }

    get advancedOnly(): boolean {
        return !(this.capacity === 1 && this.capacityField === 12);
    }

    static computeCapacity(tierFlags: number[], capabilityFlags: number[]): [number, number] {
        if (tierFlags.includes(21)) return [1, 13];
        if (tierFlags.includes(22)) return [2, 13];

        if (capabilityFlags.includes(115)) return [4, 12];
        if (tierFlags.includes(16) || capabilityFlags.includes(106)) return [3, 12];
        if (tierFlags.includes(8) || (!capabilityFlags.includes(106) && capabilityFlags.includes(19))) return [2, 12];

        return [1, 12];
    }

    static buildModelIdNameMapping(): Record<string, string> {
        const result: Record<string, string> = {};
        const models = [
            Model.UNSPECIFIED,
            Model.BASIC_PRO,
            Model.BASIC_FLASH,
            Model.BASIC_THINKING,
            Model.PLUS_PRO,
            Model.PLUS_FLASH,
            Model.PLUS_THINKING,
            Model.ADVANCED_PRO,
            Model.ADVANCED_FLASH,
            Model.ADVANCED_THINKING
        ];

        for (const member of models) {
            if (member === Model.UNSPECIFIED) continue;

            const headerValue = member.modelHeader[MODEL_HEADER_KEY] || "";
            if (!headerValue) continue;

            let modelId: string | undefined;
            try {
                const parsed = JSON.parse(headerValue);
                modelId = getNestedValue(parsed, [4]);
            } catch (e) {
                continue;
            }

            if (modelId && !result[modelId]) {
                const parts = member.modelName.split("-");
                parts.pop();
                const baseKey = "BASIC_" + member.modelName.split("-")[2].toUpperCase();

                // Simplified mapping logic for TS
                let baseName = member.modelName;
                if (member.modelName.endsWith("-plus") || member.modelName.endsWith("-advanced")) {
                    baseName = member.modelName.replace(/-plus|-advanced/, '');
                }
                result[modelId] = baseName;
            }
        }
        return result;
    }
}
