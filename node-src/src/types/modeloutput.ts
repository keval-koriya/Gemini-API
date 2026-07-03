import { Image } from './image.js';
import { GeneratedVideo, GeneratedMedia } from './video.js';
import { DeepResearchPlan } from './research.js';
import { Candidate } from './candidate.js';

export class ModelOutput {
    metadata: string[];
    candidates: Candidate[];
    chosen: number;

    constructor(metadata: string[], candidates: Candidate[], chosen: number = 0) {
        this.metadata = metadata;
        this.candidates = candidates;
        this.chosen = chosen;
    }

    toString(): string {
        return this.text.length > 100 ? this.text.substring(0, 100) + '...' : this.text;
    }

    get rcid(): string {
        return this.candidates[this.chosen].rcid;
    }

    get text(): string {
        return this.candidates[this.chosen].text;
    }

    get textDelta(): string {
        return this.candidates[this.chosen].textDelta || "";
    }

    get thoughts(): string | null {
        return this.candidates[this.chosen].thoughts;
    }

    get thoughtsDelta(): string {
        return this.candidates[this.chosen].thoughtsDelta || "";
    }

    get images(): Image[] {
        return this.candidates[this.chosen].images;
    }

    get videos(): GeneratedVideo[] {
        return this.candidates[this.chosen].generatedVideos;
    }

    get media(): GeneratedMedia[] {
        return this.candidates[this.chosen].generatedMedia;
    }

    get deepResearchPlan(): DeepResearchPlan | null {
        return this.candidates[this.chosen].deepResearchPlan;
    }
}
