export const STREAMING_FLAG_INDEX = 7;
export const GEM_FLAG_INDEX = 19;
export const TEMPORARY_CHAT_FLAG_INDEX = 45;

export const CARD_CONTENT_RE = /^http:\/\/googleusercontent\.com\/card_content\/\d+/;
export const ARTIFACTS_RE = /http:\/\/googleusercontent\.com\/\w+\/\d+\n*/g;
export const DEFAULT_METADATA = ["", "", "", null, null, null, null, null, null, ""];

export const MODEL_HEADER_KEY = "x-goog-ext-525001261-jspb";

export function buildModelHeader(modelId: string, capacityTail: string | number): Record<string, string> {
    return {
        [MODEL_HEADER_KEY]: `[1,null,null,null,"${modelId}",null,null,0,[4],null,null,${capacityTail}]`,
        "x-goog-ext-73010989-jspb": "[0]",
        "x-goog-ext-73010990-jspb": "[0]",
    };
}

export enum Endpoint {
    GOOGLE = "https://www.google.com",
    INIT = "https://gemini.google.com/app",
    GENERATE = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
    ROTATE_COOKIES = "https://accounts.google.com/RotateCookies",
    UPLOAD = "https://content-push.googleapis.com/upload",
    BATCH_EXEC = "https://gemini.google.com/_/BardChatUi/data/batchexecute"
}

export enum GRPC {
    LIST_CHATS = "MaZiqc",
    READ_CHAT = "hNvQHb",
    DELETE_CHAT_1 = "GzXR5e",
    DELETE_CHAT_2 = "qWymEb",
    LIST_GEMS = "CNgdBe",
    CREATE_GEM = "oMH3Zd",
    UPDATE_GEM = "kHv0Vd",
    DELETE_GEM = "UXcSJb",
    DEEP_RESEARCH_STATUS = "kwDCne",
    DEEP_RESEARCH_PREFS = "L5adhe",
    DEEP_RESEARCH_BOOTSTRAP = "ku4Jyf",
    DEEP_RESEARCH_MODEL_STATE = "qpEbW",
    DEEP_RESEARCH_CAPS = "aPya6c",
    DEEP_RESEARCH_ACK = "PCck7e",
    GET_USER_STATUS = "otAQ7b",
    LIST_MODELS = "otAQ7b",
    GET_FULL_SIZE_IMAGE = "c8o8Fe",
    BARD_SETTINGS = "ESY5D"
}

export const Headers = {
    REFERER: {
        "Origin": "https://gemini.google.com",
        "Referer": "https://gemini.google.com/",
    },
    SAME_DOMAIN: {
        "X-Same-Domain": "1",
    },
    get GEMINI() {
        return {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            ...Headers.REFERER,
        };
    },
    ROTATE_COOKIES: {
        "Content-Type": "application/json",
        "Origin": "https://accounts.google.com",
    },
    UPLOAD: {
        "X-Tenant-Id": "bard-storage"
    },
    BATCH_EXEC: {
        "x-goog-ext-525001261-jspb": "[1,null,null,null,null,null,null,null,[4]]",
        "x-goog-ext-73010989-jspb": "[0]",
    }
};

export class Model {
    static UNSPECIFIED = new Model("unspecified", {}, false);
    static BASIC_PRO = new Model("gemini-3-pro", buildModelHeader("9d8ca3786ebdfbea", 1), false);
    static BASIC_FLASH = new Model("gemini-3-flash", buildModelHeader("fbb127bbb056c959", 1), false);
    static BASIC_THINKING = new Model("gemini-3-flash-thinking", buildModelHeader("5bf011840784117a", 1), false);
    static PLUS_PRO = new Model("gemini-3-pro-plus", buildModelHeader("e6fa609c3fa255c0", 4), true);
    static PLUS_FLASH = new Model("gemini-3-flash-plus", buildModelHeader("56fdd199312815e2", 4), true);
    static PLUS_THINKING = new Model("gemini-3-flash-thinking-plus", buildModelHeader("e051ce1aa80aa576", 4), true);
    static ADVANCED_PRO = new Model("gemini-3-pro-advanced", buildModelHeader("e6fa609c3fa255c0", 2), true);
    static ADVANCED_FLASH = new Model("gemini-3-flash-advanced", buildModelHeader("56fdd199312815e2", 2), true);
    static ADVANCED_THINKING = new Model("gemini-3-flash-thinking-advanced", buildModelHeader("e051ce1aa80aa576", 2), true);

    constructor(
        public modelName: string,
        public modelHeader: Record<string, string>,
        public advancedOnly: boolean
    ) {}

    get modelId(): string {
        const headerValue = this.modelHeader[MODEL_HEADER_KEY];
        if (!headerValue) return "";
        try {
            const parsed = JSON.parse(headerValue);
            return parsed[4] || "";
        } catch (e) {
            return "";
        }
    }

    static fromName(name: string): Model {
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
        for (const model of models) {
            if (model.modelName === name) {
                return model;
            }
        }
        throw new Error(`Unknown model name: ${name}. Available models: ${models.map(m => m.modelName).join(', ')}`);
    }

    static fromDict(modelDict: { model_name: string, model_header: Record<string, string> }): Model {
        if (!modelDict.model_name || !modelDict.model_header) {
            throw new Error("When passing a custom model as a dictionary, 'model_name' and 'model_header' keys must be provided.");
        }
        if (typeof modelDict.model_header !== 'object') {
            throw new Error("When passing a custom model as a dictionary, 'model_header' must be a dictionary containing valid header strings.");
        }
        return new Model(modelDict.model_name, modelDict.model_header, false);
    }
}

export enum AccountStatus {
    AVAILABLE = 1000,
    ACCESS_TEMPORARILY_UNAVAILABLE = 1014,
    UNAUTHENTICATED = 1016,
    ACCOUNT_REJECTED = 1021,
    ACCOUNT_UNTRUSTED = 1033,
    TOS_PENDING = 1040,
    TOS_OUT_OF_DATE = 1042,
    ACCOUNT_REJECTED_BY_GUARDIAN = 1054,
    GUARDIAN_APPROVAL_REQUIRED = 1057,
    LOCATION_REJECTED = 1060
}

export function accountStatusFromCode(code: number | null | undefined): AccountStatus {
    if (code === null || code === undefined || code === 1000) {
        return AccountStatus.AVAILABLE;
    }
    if (Object.values(AccountStatus).includes(code)) {
        return code as AccountStatus;
    }
    return AccountStatus.ACCOUNT_REJECTED;
}

export enum ErrorCode {
    TEMPORARY_ERROR_1013 = 1013,
    USAGE_LIMIT_EXCEEDED = 1037,
    MODEL_INCONSISTENT = 1050,
    MODEL_HEADER_INVALID = 1052,
    IP_TEMPORARILY_BLOCKED = 1060
}
