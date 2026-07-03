import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { AxiosInstance } from 'axios';
import { logger } from './logger.js';
import { Endpoint, Headers } from '../constants.js';
import { AuthError } from '../exceptions.js';

export function getCookieValue(cookies: any, name: string): string | null {
    if (typeof cookies === 'string') {
        const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
        return match ? match[1] : null;
    }
    // Handle tough-cookie store if attached to axios
    if (cookies && cookies.jar && typeof cookies.jar.getCookiesSync === 'function') {
        const cookieList = cookies.jar.getCookiesSync('https://google.com');
        for (const c of cookieList) {
            if (c.key === name) {
                return c.value;
            }
        }
    }
    if (cookies && typeof cookies === 'object') {
        return cookies[name] || null;
    }
    return null;
}

export function getCookieCacheDir(): string {
    const envPath = process.env.GEMINI_COOKIE_PATH;
    return envPath ? envPath : path.join(os.tmpdir(), "gemini_webapi");
}

export function getCookiesCachePath(cookies: any, verbose: boolean = false): string | null {
    const secure1psid = getCookieValue(cookies, "__Secure-1PSID");
    if (!secure1psid) {
        if (verbose) {
            logger.warn("Cannot save cookies: __Secure-1PSID not found.");
        }
        return null;
    }
    return path.join(getCookieCacheDir(), `.cached_cookies_${secure1psid}.json`);
}

export async function saveCookies(cookies: any, verbose: boolean = false): Promise<void> {
    const cachePath = getCookiesCachePath(cookies, verbose);
    if (!cachePath) return;

    let cookieList: any[] = [];
    if (cookies && cookies.jar && typeof cookies.jar.getCookiesSync === 'function') {
        const syncCookies = cookies.jar.getCookiesSync('https://google.com');
        for (const cookie of syncCookies) {
            const isAuthCookie = cookie.key === "__Secure-1PSID" || cookie.key === "__Secure-1PSIDTS";
            const domain = cookie.domain ? cookie.domain.replace(/^\./, '').toLowerCase() : "";
            const isGoogleDomain = domain === "google.com" || domain.endsWith(".google.com");

            let isExpired = false;
            if (cookie.expires && cookie.expires !== 'Infinity') {
                isExpired = new Date(cookie.expires).getTime() < Date.now();
            }

            if (isGoogleDomain && (isAuthCookie || !isExpired)) {
                cookieList.push({
                    name: cookie.key,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    expires: cookie.expires
                });
            }
        }
    } else if (cookies && typeof cookies === 'object') {
        // Simple fallback
        for (const [key, value] of Object.entries(cookies)) {
             if (key === "__Secure-1PSID" || key === "__Secure-1PSIDTS") {
                 cookieList.push({ name: key, value: value });
             }
        }
    }

    if (cookieList.length > 0) {
        try {
            await fs.mkdir(path.dirname(cachePath), { recursive: true });
            await fs.writeFile(cachePath, JSON.stringify(cookieList), { mode: 0o600 });
            if (verbose) {
                logger.debug(`Saved cookies to cache successfully (${cookieList.length} cookies).`);
            }
        } catch (e) {
            if (verbose) {
                logger.warn(`Failed to save cookies: ${e}`);
            }
        }
    }
}

export async function rotate1psidts(client: AxiosInstance, cookies: any, verbose: boolean = false): Promise<string | null> {
    const cachePath = getCookiesCachePath(cookies, verbose);
    if (!cachePath) return null;

    try {
        const stats = await fs.stat(cachePath);
        if (Date.now() - stats.mtimeMs <= 60000) {
            if (verbose) {
                logger.debug("Rotation skipped, cache is still fresh (< 60s).");
            }
            return getCookieValue(cookies, "__Secure-1PSIDTS");
        }
    } catch (e) {
        // File doesn't exist, proceed
    }

    try {
        const response = await client.post(
            Endpoint.ROTATE_COOKIES,
            '[000,"-0000000000000000000"]',
            { headers: Headers.ROTATE_COOKIES, validateStatus: () => true }
        );

        if (verbose) {
            logger.debug(`HTTP Request: POST ${Endpoint.ROTATE_COOKIES} [${response.status}]`);
        }

        if (response.status === 401) {
            throw new AuthError("Unauthorized during cookie rotation");
        }

        if (response.status >= 400) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        // Axios doesn't automatically expose an easy cookie jar without addons
        // Assuming client handles cookies natively (e.g. via tough-cookie interceptor)
        await saveCookies(cookies, verbose);
        const new1psidts = getCookieValue(cookies, "__Secure-1PSIDTS");

        if (new1psidts) {
            return new1psidts;
        }

        logger.debug(`Rotation completed but __Secure-1PSIDTS not found.`);
        return null;

    } catch (e: any) {
        if (e instanceof AuthError) throw e;
        if (verbose) {
            logger.warn(`Rotation failed: ${e.message}`);
        }
        throw e;
    }
}
