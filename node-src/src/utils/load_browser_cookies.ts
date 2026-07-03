import { logger } from './logger.js';

export const HAS_BC3 = false;

export async function loadBrowserCookies(domainName: string = "", verbose: boolean = false): Promise<Record<string, any[]>> {
    if (!HAS_BC3) {
        if (verbose) {
            logger.debug("Optional dependency for browser cookies not found. Skipping browser cookie loading.");
        }
        return {};
    }
    return {};
}
