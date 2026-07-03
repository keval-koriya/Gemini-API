export class AuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthError';
    }
}

export class APIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'APIError';
    }
}

export class ImageGenerationError extends APIError {
    constructor(message: string) {
        super(message);
        this.name = 'ImageGenerationError';
    }
}

export class GeminiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GeminiError';
    }
}

export class TimeoutError extends GeminiError {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class UsageLimitExceeded extends GeminiError {
    constructor(message: string) {
        super(message);
        this.name = 'UsageLimitExceeded';
    }
}

export class ModelInvalid extends GeminiError {
    constructor(message: string) {
        super(message);
        this.name = 'ModelInvalid';
    }
}

export class TemporarilyBlocked extends GeminiError {
    constructor(message: string) {
        super(message);
        this.name = 'TemporarilyBlocked';
    }
}
