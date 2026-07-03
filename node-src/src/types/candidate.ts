import { Image, WebImage, GeneratedImage } from './image.js';
import { GeneratedVideo, GeneratedMedia } from './video.js';
import { DeepResearchPlan } from './research.js';
import * as htmlEntities from 'html-entities';

export class Candidate {
    rcid: string;
    text: string;
    textDelta: string | null;
    thoughts: string | null;
    thoughtsDelta: string | null;
    webImages: WebImage[];
    generatedImages: GeneratedImage[];
    generatedVideos: GeneratedVideo[];
    generatedMedia: GeneratedMedia[];
    deepResearchPlan: DeepResearchPlan | null;

    constructor(
        rcid: string,
        text: string,
        textDelta: string | null = null,
        thoughts: string | null = null,
        thoughtsDelta: string | null = null,
        webImages: WebImage[] = [],
        generatedImages: GeneratedImage[] = [],
        generatedVideos: GeneratedVideo[] = [],
        generatedMedia: GeneratedMedia[] = [],
        deepResearchPlan: DeepResearchPlan | null = null
    ) {
        this.rcid = rcid;
        this.text = Candidate.decodeHtml(text);
        this.textDelta = textDelta;
        this.thoughts = thoughts ? Candidate.decodeHtml(thoughts) : null;
        this.thoughtsDelta = thoughtsDelta;
        this.webImages = webImages;
        this.generatedImages = generatedImages;
        this.generatedVideos = generatedVideos;
        this.generatedMedia = generatedMedia;
        this.deepResearchPlan = deepResearchPlan;
    }

    static decodeHtml(value: string): string {
        if (value) {
            return htmlEntities.decode(value);
        }
        return value;
    }

    get images(): Image[] {
        return [...this.webImages, ...this.generatedImages];
    }

    toString(): string {
        return this.text.length > 100 ? this.text.substring(0, 100) + '...' : this.text;
    }
}
