import { ModelOutput } from './modeloutput.js';

export class ChatTurn {
    role: string;
    text: string;
    modelOutput: ModelOutput | null;

    constructor(role: string, text: string, modelOutput: ModelOutput | null = null) {
        this.role = role;
        this.text = text;
        this.modelOutput = modelOutput;
    }

    toString(): string {
        const shorten = this.text.length > 100 ? this.text.substring(0, 100) + '...' : this.text;
        return `${this.role.toUpperCase()}: ${shorten}`;
    }
}

export class ChatHistory {
    cid: string;
    turns: ChatTurn[];

    constructor(cid: string, turns: ChatTurn[]) {
        this.cid = cid;
        this.turns = turns;
    }

    toString(): string {
        return `ChatHistory(cid='${this.cid}')`;
    }
}
