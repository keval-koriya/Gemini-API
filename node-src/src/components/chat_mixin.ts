import { GRPC } from '../constants.js';
import { ChatHistory, ChatInfo, ChatTurn, Candidate, ModelOutput, RPCData, serializeRPCData } from '../types/index.js';
import { getNestedValue } from '../utils/parsing.js';
import { logger } from '../utils/logger.js';

export class ChatMixin {
    _recentChats: ChatInfo[] | null = null;
    _batchExecute: (payloads: any[], kwargs?: any) => Promise<any>;
    _parseCandidate: (candidateData: any, cid: string, rid: string, rcid: string) => [string, string | null, any[], any[], any[], any[]];

    constructor() {
        this._batchExecute = async () => { throw new Error("Not implemented in Mixin"); };
        this._parseCandidate = () => { throw new Error("Not implemented in Mixin"); };
    }

    async _fetchRecentChats(recent: number = 13): Promise<void> {
        const responseChats1 = await this._batchExecute([
            { rpcid: GRPC.LIST_CHATS, payload: JSON.stringify([recent, null, [1, null, 1]]), identifier: "generic" }
        ]);
        const responseChats2 = await this._batchExecute([
            { rpcid: GRPC.LIST_CHATS, payload: JSON.stringify([recent, null, [0, null, 1]]), identifier: "generic" }
        ]);

        const recentChats: ChatInfo[] = [];

        const extractChats = (responseText: string) => {
            // Simplified logic: the real parsing is complex and depends on extractJsonFromResponse equivalent
            // We assume _batchExecute returns parsed JSON data or we parse it
            let parts: any[];
            try {
                // Remove magic string if present
                let text = responseText;
                if (text.startsWith(")]}'")) {
                    text = text.substring(4).trim();
                }
                parts = JSON.parse(text);
            } catch {
                return;
            }

            for (const part of parts) {
                const partBodyStr = getNestedValue(part, [2]);
                if (!partBodyStr) continue;

                try {
                    const partBody = JSON.parse(partBodyStr);
                    const chatList = getNestedValue(partBody, [2]);
                    if (Array.isArray(chatList)) {
                        for (const chatData of chatList) {
                            if (Array.isArray(chatData) && chatData.length > 1) {
                                const cid = getNestedValue(chatData, [0], "");
                                const title = getNestedValue(chatData, [1], "");
                                const isPinned = Boolean(getNestedValue(chatData, [2]));
                                const timestampData = getNestedValue(chatData, [5]);
                                let timestamp = 0.0;
                                if (Array.isArray(timestampData) && timestampData.length >= 2) {
                                    timestamp = parseFloat(timestampData[0]) + (parseFloat(timestampData[1]) / 1e9);
                                }

                                if (cid) {
                                    if (!recentChats.some(c => c.cid === cid)) {
                                        recentChats.push(new ChatInfo(cid, title, timestamp, isPinned));
                                    }
                                }
                            }
                        }
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
        };

        if (responseChats1 && responseChats1.data) extractChats(responseChats1.data);
        if (responseChats2 && responseChats2.data) extractChats(responseChats2.data);

        this._recentChats = recentChats;
    }

    listChats(): ChatInfo[] | null {
        return this._recentChats;
    }

    async readChat(cid: string, limit: number = 10): Promise<ChatHistory | null> {
        try {
            const response = await this._batchExecute([
                { rpcid: GRPC.READ_CHAT, payload: JSON.stringify([cid, limit, null, 1, [1], [4], null, 1]), identifier: "generic" }
            ]);

            let parts: any[];
            let text = response.data;
            if (text.startsWith(")]}'")) text = text.substring(4).trim();
            parts = JSON.parse(text);

            for (const part of parts) {
                const partBodyStr = getNestedValue(part, [2]);
                if (!partBodyStr) continue;

                const partBody = JSON.parse(partBodyStr);
                const turnsData = getNestedValue(partBody, [0]);
                if (!turnsData) continue;

                const chatTurns: ChatTurn[] = [];
                for (const convTurn of turnsData) {
                    const rid = getNestedValue(convTurn, [0, 1], "");

                    // Model turn
                    const candidatesList = getNestedValue(convTurn, [3, 0]);
                    if (candidatesList) {
                        const outputCandidates: Candidate[] = [];
                        for (const candidateData of candidatesList) {
                            const completionStatus = getNestedValue(candidateData, [8, 0]);
                            const hasProgressSignal = getNestedValue(candidateData, [12, 6, 0]) !== null;

                            if (completionStatus === 2) {
                                logger.debug(`[read_chat] Gemini has successfully finalized the response for '${cid}'.`);
                            } else if (hasProgressSignal) {
                                logger.debug(`[read_chat] Gemini is still working on the response for '${cid}'. Continuing to wait...`);
                                return null;
                            } else {
                                const reason = getNestedValue(candidateData, [1, 0]) || "Gemini has stopped generating.";
                                logger.warn(`[read_chat] Gemini generation was interrupted/stopped for '${cid}'. Reason: ${reason}`);
                            }

                            const rcid = getNestedValue(candidateData, [0]);
                            if (!rcid) continue;

                            const [textOutput, thoughtsOutput, webImages, generatedImages, generatedVideos, generatedMedia] =
                                this._parseCandidate(candidateData, cid, rid, rcid);

                            outputCandidates.push(new Candidate(
                                rcid, textOutput, textOutput, thoughtsOutput, thoughtsOutput,
                                webImages, generatedImages, generatedVideos, generatedMedia
                            ));
                        }
                        if (outputCandidates.length > 0) {
                            const modelOutput = new ModelOutput([cid, rid], outputCandidates);
                            chatTurns.push(new ChatTurn("model", modelOutput.text, modelOutput));
                        }
                    }

                    // User turn
                    const userText = getNestedValue(convTurn, [2, 0, 0], "");
                    if (userText) {
                        chatTurns.push(new ChatTurn("user", userText));
                    }
                }
                return new ChatHistory(cid, chatTurns);
            }
            return null;
        } catch (e) {
            logger.debug(`[read_chat] Response data for '${cid}' is still incomplete (model is still processing)...`);
            return null;
        }
    }

    async fetchLatestChatResponse(cid: string): Promise<ModelOutput | null> {
        try {
            const history = await this.readChat(cid, 5);
            if (!history || !history.turns || history.turns.length === 0) {
                logger.debug(`fetchLatestChatResponse('${cid}'): no turns`);
                return null;
            }
            for (const turn of history.turns) {
                if (turn.role === "model" && turn.modelOutput) {
                    logger.debug(`fetchLatestChatResponse('${cid}'): found model turn with ${turn.text.length} chars`);
                    return turn.modelOutput;
                }
            }
            logger.debug(`fetchLatestChatResponse('${cid}'): no model turns`);
            return null;
        } catch (e: any) {
            logger.debug(`fetchLatestChatResponse('${cid}') failed: ${e.name}: ${e.message}`);
            return null;
        }
    }

    async deleteChat(cid: string): Promise<void> {
        await this._batchExecute([
            { rpcid: GRPC.DELETE_CHAT_1, payload: JSON.stringify([cid]), identifier: "generic" }
        ]);
        await this._batchExecute([
            { rpcid: GRPC.DELETE_CHAT_2, payload: JSON.stringify([cid, [1, null, 0, 1]]), identifier: "generic" }
        ]);
    }
}
