import { ModelOutput } from './modeloutput.js';
import { DeepResearchPlan, DeepResearchStatus } from './research.js';

export class DeepResearchResult {
    plan: DeepResearchPlan;
    startOutput: ModelOutput | null;
    finalOutput: ModelOutput | null;
    statuses: DeepResearchStatus[];
    done: boolean;

    constructor(
        plan: DeepResearchPlan,
        startOutput: ModelOutput | null = null,
        finalOutput: ModelOutput | null = null,
        statuses: DeepResearchStatus[] = [],
        done: boolean = false
    ) {
        this.plan = plan;
        this.startOutput = startOutput;
        this.finalOutput = finalOutput;
        this.statuses = statuses;
        this.done = done;
    }

    toString(): string {
        return `DeepResearchResult(plan=${this.plan.toString()}, done=${this.done})`;
    }

    get text(): string {
        if (this.finalOutput) {
            return this.finalOutput.text;
        }
        return "";
    }
}
