import { getNestedValue } from './parsing.js';

const RESEARCH_ID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const CHAT_ID_RE = /\bc_[A-Za-z0-9_]+\b/;
const URL_RE = /^https?:\/\//;

function* iterNested(data: any): IterableIterator<any> {
    yield data;
    if (Array.isArray(data)) {
        for (const item of data) {
            yield* iterNested(item);
        }
    } else if (data && typeof data === 'object') {
        for (const value of Object.values(data)) {
            yield* iterNested(value);
        }
    }
}

function findFirstMatch(data: any, pattern: RegExp): string | null {
    for (const item of iterNested(data)) {
        if (typeof item === 'string') {
            const match = pattern.exec(item);
            if (match) {
                return match[0];
            }
        }
    }
    return null;
}

function findFirstString(data: any, exclude: Set<string> = new Set()): string | null {
    for (const item of iterNested(data)) {
        if (typeof item === 'string' && item && !exclude.has(item)) {
            return item;
        }
    }
    return null;
}

function extractResearchId(data: any): string | null {
    return findFirstMatch(data, RESEARCH_ID_RE);
}

function extractChatId(data: any): string | null {
    return findFirstMatch(data, CHAT_ID_RE);
}

function collectResearchNotes(data: any, exclude: Set<string> = new Set()): string[] {
    const notes: string[] = [];
    const seen: Set<string> = new Set();

    for (const item of iterNested(data)) {
        if (typeof item !== 'string') continue;
        const text = item.trim();
        if (!text || exclude.has(text) || seen.has(text) || URL_RE.test(text) || text.length < 12) continue;

        seen.add(text);
        notes.push(text);
        if (notes.length >= 12) break;
    }

    return notes;
}

function findFirstDictKey(data: any, key: string): Record<string, any> | null {
    for (const item of iterNested(data)) {
        if (item && typeof item === 'object' && !Array.isArray(item) && key in item) {
            return item;
        }
    }
    return null;
}

export function extractDeepResearchPlan(candidateData: any[], fallbackText: string = ""): Record<string, any> | null {
    let metaDict: Record<string, any> | null = null;
    let payload: any = null;

    for (const key of ["56", "57"]) {
        metaDict = findFirstDictKey(candidateData, key);
        if (metaDict && Array.isArray(metaDict[key])) {
            payload = metaDict[key];
            break;
        }
    }

    if (!metaDict || !payload) return null;

    const researchId = extractResearchId(candidateData);
    const titleRaw = getNestedValue(payload, [0]);
    const title = typeof titleRaw === 'string' ? titleRaw : null;

    const stepsPayload = getNestedValue(payload, [1], []);
    const steps: string[] = [];
    if (Array.isArray(stepsPayload)) {
        for (const step of stepsPayload) {
            if (Array.isArray(step)) {
                const label = step.length > 1 && typeof step[1] === 'string' ? step[1] : null;
                const body = step.length > 2 && typeof step[2] === 'string' ? step[2] : null;
                if (label && body) steps.push(`${label}: ${body}`);
                else if (body) steps.push(body);
                else if (label) steps.push(label);
            }
        }
    }

    const modifyPayload = getNestedValue(payload, [5]);
    let modifyPrompt = null;
    if (Array.isArray(modifyPayload)) {
        modifyPrompt = findFirstString(modifyPayload);
    }

    const queryRaw = getNestedValue(payload, [1, 0, 2]);
    const query = typeof queryRaw === 'string' ? queryRaw : null;

    const etaTextRaw = getNestedValue(payload, [2]);
    const etaText = typeof etaTextRaw === 'string' ? etaTextRaw : null;

    const confirmPromptRaw = getNestedValue(payload, [3, 0]);
    const confirmPrompt = typeof confirmPromptRaw === 'string' ? confirmPromptRaw : null;

    const confirmationUrlRaw = getNestedValue(payload, [4, 0]);
    const confirmationUrl = typeof confirmationUrlRaw === 'string' ? confirmationUrlRaw : null;

    const rawStateRaw = metaDict["70"];
    const rawState = typeof rawStateRaw === 'number' ? rawStateRaw : null;

    if (![title, query, steps.length > 0 ? true : null, etaText, confirmPrompt, confirmationUrl, modifyPrompt].some(Boolean)) {
        return null;
    }

    return {
        research_id: researchId,
        title: title,
        query: query,
        steps: steps,
        eta_text: etaText,
        confirm_prompt: confirmPrompt,
        confirmation_url: confirmationUrl,
        modify_prompt: modifyPrompt,
        raw_state: rawState,
        response_text: fallbackText || null
    };
}

export function extractDeepResearchStatusPayload(payload: any): Record<string, any> | null {
    const data = (Array.isArray(payload) && payload.length > 0 && Array.isArray(payload[0])) ? payload[0] : payload;
    const researchId = extractResearchId(data);
    if (!researchId) return null;

    const titleRaw = getNestedValue(data, [1, 4, 0]);
    const title = typeof titleRaw === 'string' ? titleRaw : null;

    const queryRaw = getNestedValue(data, [1, 4, 1]);
    const query = typeof queryRaw === 'string' ? queryRaw : null;

    const cidRaw = getNestedValue(data, [1, 3, 0]) || extractChatId(data);
    const cid = typeof cidRaw === 'string' ? cidRaw : null;

    let rawState: number | null = null;
    const metaDict = findFirstDictKey(data, "70");
    if (metaDict && typeof metaDict["70"] === 'number') {
        rawState = metaDict["70"];
    }

    const markerStrings: string[] = [];
    for (const item of iterNested(data)) {
        if (typeof item === 'string' && item) {
            markerStrings.push(item);
        }
    }

    const done = markerStrings.some(item => item.includes("immersive_entry_chip"));
    const awaitingConfirmation = markerStrings.some(item => item.includes("deep_research_confirmation_content"));

    const state = done ? "completed" : (awaitingConfirmation ? "awaiting_confirmation" : "running");

    const excludeSet = new Set<string>();
    [title, query, researchId, cid].forEach(s => { if (typeof s === 'string') excludeSet.add(s); });
    const notes = collectResearchNotes(data, excludeSet);

    return {
        research_id: researchId,
        state: state,
        title: title,
        query: query,
        cid: cid,
        notes: notes,
        done: done,
        raw_state: rawState,
        raw: payload
    };
}
