import { logger } from './logger.js';

export function running(retryCount: number = 2) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args: any[]) {
            let attempt = 0;
            while (attempt < retryCount) {
                try {
                    return await originalMethod.apply(this, args);
                } catch (error) {
                    attempt++;
                    if (attempt >= retryCount) {
                        throw error;
                    }
                    logger.debug(`[Retry] Attempt ${attempt} failed. Retrying...`);
                }
            }
        };
        return descriptor;
    };
}
