export class Gem {
    id: string;
    name: string;
    description: string | null;
    prompt: string | null;
    predefined: boolean;

    constructor(
        id: string,
        name: string,
        predefined: boolean,
        description: string | null = null,
        prompt: string | null = null
    ) {
        this.id = id;
        this.name = name;
        this.predefined = predefined;
        this.description = description;
        this.prompt = prompt;
    }

    toString(): string {
        return `Gem(id='${this.id}', name='${this.name}', predefined=${this.predefined})`;
    }
}

export class GemJar extends Map<string, Gem> {

    getGem(id: string | null = null, name: string | null = null, defaultValue: Gem | null = null): Gem | null {
        if (id === null && name === null) {
            throw new Error("At least one of gem id or name must be provided.");
        }

        if (id !== null) {
            const gemCandidate = this.get(id);
            if (gemCandidate) {
                if (name !== null) {
                    if (gemCandidate.name === name) {
                        return gemCandidate;
                    } else {
                        return defaultValue;
                    }
                } else {
                    return gemCandidate;
                }
            } else {
                return defaultValue;
            }
        } else if (name !== null) {
            for (const gemObj of this.values()) {
                if (gemObj.name === name) {
                    return gemObj;
                }
            }
            return defaultValue;
        }

        return defaultValue;
    }

    filterGems(predefined: boolean | null = null, name: string | null = null): GemJar {
        const filteredGems = new GemJar();

        for (const [gemId, gem] of this.entries()) {
            if (predefined !== null && gem.predefined !== predefined) {
                continue;
            }
            if (name !== null && gem.name !== name) {
                continue;
            }
            filteredGems.set(gemId, gem);
        }

        return filteredGems;
    }
}
