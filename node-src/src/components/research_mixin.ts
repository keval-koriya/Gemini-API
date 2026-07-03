import { GRPC, Model } from '../constants.js';
import { DeepResearchPlan, DeepResearchStatus, DeepResearchResult, ModelOutput, RPCData } from '../types/index.js';
import { APIError, GeminiError, UsageLimitExceeded, TimeoutError, ModelInvalid, TemporarilyBlocked } from '../exceptions.js';
import { extractDeepResearchStatusPayload, getNestedValue } from '../utils/index.js';
import { logger } from '../utils/logger.js';

export class ResearchMixin {
    _batchExecute: (payloads: any[], kwargs?: any) => Promise<any>;
    accountPath: string = "";
    fetchLatestChatResponse: (cid: string) => Promise<ModelOutput | null>;
    startChat: (kwargs?: any) => any;

    constructor() {
        this._batchExecute = async () => { throw new Error("Not implemented in Mixin"); };
        this.fetchLatestChatResponse = async () => { throw new Error("Not implemented in Mixin"); };
        this.startChat = () => { throw new Error("Not implemented in Mixin"); };
    }

    async inspectAccountStatus(): Promise<any> {
        const probes = [
            ["activity", GRPC.BARD_SETTINGS, '[[["bard_activity_enabled"]]]'],
            ["bootstrap", GRPC.DEEP_RESEARCH_BOOTSTRAP, '["en",null,null,null,4,null,null,[2,4,7,15],null,[[5]]]'],
            ["model_state", GRPC.DEEP_RESEARCH_MODEL_STATE, '[[[1,4],[6,6],[1,15]]]'],
            ["quota", GRPC.DEEP_RESEARCH_MODEL_STATE, '[[[1,11],[2,11],[6,11]]]'],
            ["caps", GRPC.DEEP_RESEARCH_CAPS, '[]']
        ];

        const result: any = {
            source_path: "/app",
            account_path: this.accountPath,
            rpc: {}
        };

        for (const [probeName, rpcid, payload] of probes) {
            try {
                const response = await this._batchExecute([{ rpcid, payload, identifier: "generic" }], { closeOnError: false });
                const parsed: any[] = [];
                let rejectCode = null;

                let text = response.data;
                if (text.startsWith(")]}'")) text = text.substring(4).trim();
                const parts = JSON.parse(text);

                for (const part of parts) {
                    if (getNestedValue(part, [0]) !== "wrb.fr") continue;
                    if (getNestedValue(part, [1]) !== rpcid) continue;

                    const code = getNestedValue(part, [5, 0]);
                    if (typeof code === 'number') rejectCode = code;

                    const body = getNestedValue(part, [2]);
                    if (typeof body === 'string') {
                        try {
                            parsed.push(JSON.parse(body));
                        } catch {
                            parsed.push(body);
                        }
                    } else if (body !== null) {
                        parsed.push(body);
                    }
                }

                result.rpc[probeName] = {
                    rpcid,
                    ok: true,
                    status_code: response.status,
                    parsed,
                    reject_code: rejectCode,
                    raw_preview: response.data.substring(0, 300)
                };
            } catch (e: any) {
                result.rpc[probeName] = {
                    rpcid,
                    ok: false,
                    error: `${e.name}: ${e.message}`
                };
            }
        }

        const rejected = Object.keys(result.rpc).filter(name => result.rpc[name].reject_code === 7);
        const drProbes = ["bootstrap", "model_state", "caps"];
        const drAvailable = drProbes.every(p => result.rpc[p] && result.rpc[p].ok && result.rpc[p].reject_code === null);

        result.summary = {
            deep_research_feature_present: drAvailable,
            rejected_probes: rejected
        };

        return result;
    }

    async _assertDeepResearchCapable(): Promise<void> {
        const snapshot = await this.inspectAccountStatus();
        const summary = snapshot.summary || {};

        if (!summary.deep_research_feature_present) {
            const rejected = summary.rejected_probes || [];
            const rpc = snapshot.rpc || {};
            const failed = Object.keys(rpc).filter(name => !rpc[name].ok);
            throw new GeminiError(`Current account/session appears not eligible for deep research. Rejected: ${rejected}, Failed: ${failed}`);
        }
    }

    async _deepResearchPreflight(): Promise<void> {
        const bestEffort = async (payloads: any[]) => {
            try {
                await this._batchExecute(payloads, { closeOnError: false });
            } catch (e) {
                logger.warn(`Skipping non-critical preflight RPC: ${e}`);
            }
        };

        await bestEffort([{ rpcid: GRPC.BARD_SETTINGS, payload: '[[["bard_activity_enabled"]]]', identifier: "generic" }]);
        await bestEffort([{ rpcid: GRPC.DEEP_RESEARCH_BOOTSTRAP, payload: '["en",null,null,null,4,null,null,[2,4,7,15],null,[[5]]]', identifier: "generic" }]);
    }

    async _collectResearchOutput(chat: any, prompt: string): Promise<ModelOutput> {
        let recoverableError: Error | null = null;
        try {
            const output = await chat.sendMessage(prompt, { deepResearch: true });
            const preview = (output.text || "").trim();
            if (output.deepResearchPlan || preview) {
                chat.lastOutput = output;
                return output;
            }
        } catch (e: any) {
            if (e instanceof UsageLimitExceeded || e instanceof TimeoutError || e instanceof ModelInvalid || e instanceof TemporarilyBlocked) {
                throw e;
            } else if (e instanceof GeminiError || e instanceof APIError) {
                recoverableError = e;
            } else {
                recoverableError = e;
            }
        }

        if (chat.cid) {
            const fallback = await this.fetchLatestChatResponse(chat.cid);
            if (fallback) {
                chat.lastOutput = fallback;
                return fallback;
            }
        }

        if (recoverableError) throw recoverableError;

        throw new GeminiError(`Gemini returned no usable output for deep research. chat.cid='${chat.cid}'`);
    }

    async createDeepResearchPlan(prompt: string, chat: any = null, model: Model | string | any = Model.UNSPECIFIED): Promise<DeepResearchPlan> {
        if (!chat) {
            chat = this.startChat({ model });
        }

        await this._assertDeepResearchCapable();
        await this._deepResearchPreflight();
        const output = await this._collectResearchOutput(chat, prompt);
        const plan = output.deepResearchPlan;

        if (!plan) {
            const preview = output.text ? output.text.substring(0, 1200) : "";
            throw new GeminiError(`Gemini did not return a deep research plan. Preview: '${preview}'`);
        }

        plan.metadata = [...chat.metadata];
        plan.cid = chat.cid || plan.cid;
        if (!plan.confirmPrompt) plan.confirmPrompt = "Start research";
        if (!plan.responseText) plan.responseText = output.text;

        return plan;
    }

    async startDeepResearch(plan: DeepResearchPlan, chat: any = null, confirmPrompt: string | null = null): Promise<ModelOutput> {
        if (!chat) {
            chat = this.startChat({ metadata: [...plan.metadata], cid: plan.cid });
        }
        await this._deepResearchPreflight();
        const prompt = confirmPrompt || plan.confirmPrompt || "Start research";
        return await this._collectResearchOutput(chat, prompt);
    }

    async getDeepResearchStatus(researchId: string): Promise<DeepResearchStatus | null> {
        const response = await this._batchExecute([{ rpcid: GRPC.DEEP_RESEARCH_STATUS, payload: JSON.stringify([researchId]), identifier: "generic" }]);
        let text = response.data;
        if (text.startsWith(")]}'")) text = text.substring(4).trim();
        const parts = JSON.parse(text);

        for (const part of parts) {
            const partBodyStr = getNestedValue(part, [2]);
            if (!partBodyStr) continue;
            try {
                const partBody = JSON.parse(partBodyStr);
                const parsed = extractDeepResearchStatusPayload(partBody);
                if (parsed) {
                    return new DeepResearchStatus(
                        parsed.research_id, parsed.state, parsed.title, parsed.query, parsed.cid,
                        parsed.notes, parsed.done, parsed.raw_state, parsed.raw
                    );
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    async waitForDeepResearch(
        plan: DeepResearchPlan,
        pollInterval: number = 10.0,
        timeout: number = 600.0,
        onStatus: ((status: DeepResearchStatus) => void) | null = null
    ): Promise<DeepResearchResult> {
        if (!plan.researchId) {
            throw new GeminiError("Cannot poll deep research status: plan.researchId is missing. The research task may not have started successfully.");
        }

        const start = Date.now() / 1000;
        const statuses: DeepResearchStatus[] = [];
        const chat = this.startChat({ metadata: [...plan.metadata], cid: plan.cid });

        while ((Date.now() / 1000) - start < timeout) {
            let status = null;
            if (plan.researchId) {
                status = await this.getDeepResearchStatus(plan.researchId);
            }
            if (status) {
                statuses.push(status);
                logger.debug(`Deep research [${plan.researchId}] status: ${status.state}`);
                if (onStatus) onStatus(status);
                if (status.done) break;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
        }

        if (statuses.length === 0 || !statuses[statuses.length - 1].done) {
            logger.warn(`Deep research [${plan.researchId}] timed out after ${timeout}s with ${statuses.length} status updates`);
        }

        let finalOutput = null;
        if (chat.cid) {
            finalOutput = await this.fetchLatestChatResponse(chat.cid);
        }

        const done = statuses.length > 0 && statuses[statuses.length - 1].done;
        return new DeepResearchResult(plan, null, finalOutput, statuses, done);
    }

    async deepResearch(
        prompt: string,
        pollInterval: number = 10.0,
        timeout: number = 600.0,
        onStatus: ((status: DeepResearchStatus) => void) | null = null
    ): Promise<DeepResearchResult> {
        const plan = await this.createDeepResearchPlan(prompt);
        const startOutput = await this.startDeepResearch(plan);
        const result = await this.waitForDeepResearch(plan, pollInterval, timeout, onStatus);
        result.startOutput = startOutput;
        return result;
    }
}
