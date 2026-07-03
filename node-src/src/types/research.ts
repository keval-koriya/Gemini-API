export class DeepResearchPlan {
    researchId: string | null;
    title: string | null;
    query: string | null;
    steps: string[];
    etaText: string | null;
    confirmPrompt: string | null;
    modifyPrompt: string | null;
    confirmationUrl: string | null;
    metadata: (string | null)[];
    cid: string | null;
    responseText: string | null;
    rawState: number | null;

    constructor(
        researchId: string | null = null,
        title: string | null = null,
        query: string | null = null,
        steps: string[] = [],
        etaText: string | null = null,
        confirmPrompt: string | null = null,
        modifyPrompt: string | null = null,
        confirmationUrl: string | null = null,
        metadata: (string | null)[] = [],
        cid: string | null = null,
        responseText: string | null = null,
        rawState: number | null = null
    ) {
        this.researchId = researchId;
        this.title = title;
        this.query = query;
        this.steps = steps;
        this.etaText = etaText;
        this.confirmPrompt = confirmPrompt;
        this.modifyPrompt = modifyPrompt;
        this.confirmationUrl = confirmationUrl;
        this.metadata = metadata;
        this.cid = cid;
        this.responseText = responseText;
        this.rawState = rawState;
    }

    toString(): string {
        return `DeepResearchPlan(researchId='${this.researchId}', title='${this.title}', etaText='${this.etaText}', metadata=[${this.metadata}])`;
    }
}

export class DeepResearchStatus {
    researchId: string;
    state: string;
    title: string | null;
    query: string | null;
    cid: string | null;
    notes: string[];
    done: boolean;
    rawState: number | null;
    raw: any;

    constructor(
        researchId: string,
        state: string = "running",
        title: string | null = null,
        query: string | null = null,
        cid: string | null = null,
        notes: string[] = [],
        done: boolean = false,
        rawState: number | null = null,
        raw: any = null
    ) {
        this.researchId = researchId;
        this.state = state;
        this.title = title;
        this.query = query;
        this.cid = cid;
        this.notes = notes;
        this.done = done;
        this.rawState = rawState;
        this.raw = raw;
    }

    toString(): string {
        return `DeepResearchStatus(researchId='${this.researchId}', state='${this.state}', title='${this.title}', done=${this.done})`;
    }
}
