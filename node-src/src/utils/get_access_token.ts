import { promises as fs } from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { loadBrowserCookies } from './load_browser_cookies.js';
import { logger } from './logger.js';
import { getCookieValue, getCookiesCachePath, getCookieCacheDir } from './rotate_1psidts.js';
import { Endpoint, Headers } from '../constants.js';
import { AuthError } from '../exceptions.js';

// Setup to use axios-cookiejar-support in the future if needed, but for now we'll mock cookies
// In real node-JS usage, we highly recommend `axios-cookiejar-support` + `tough-cookie`

export async function sendRequest(
    client: AxiosInstance,
    cookies: any,
    verbose: boolean = false
): Promise<any> {
    // If we have a simple dict of cookies
    let cookieStr = '';
    if (typeof cookies === 'object' && !cookies.jar) {
        cookieStr = Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    } else if (cookies && cookies.jar && typeof cookies.jar.getCookieStringSync === 'function') {
        cookieStr = cookies.jar.getCookieStringSync('https://google.com');
    }

    const response = await client.get(Endpoint.INIT, {
        headers: {
            ...Headers.GEMINI,
            Cookie: cookieStr
        },
        validateStatus: () => true
    });

    if (verbose) {
        logger.debug(`HTTP Request: GET ${Endpoint.INIT} [${response.status}]`);
    }

    if (response.status >= 400) {
        throw new Error(`HTTP Error: ${response.status}`);
    }

    return response;
}

export async function getAccessToken(
    baseCookies: Record<string, string>,
    proxy: string | null = null,
    verbose: boolean = false,
    verify: boolean = true
): Promise<[string | null, string | null, string | null, string | null, string | null, AxiosInstance, any]> {

    const client = axios.create({
        proxy: proxy ? false : false // We handle proxy externally or via axios config
    });

    try {
        const preflight = await client.get(Endpoint.GOOGLE, { validateStatus: () => true });
        if (verbose) {
            logger.debug(`HTTP Request: GET ${Endpoint.GOOGLE} [${preflight.status}]`);
        }
    } catch (e) {
        throw e;
    }

    const cookieJarsToTest: [Record<string, string>, string][] = [];
    const triedSessions: Record<string, Set<string>> = {};

    const basePsid = baseCookies["__Secure-1PSID"];
    const basePsidts = baseCookies["__Secure-1PSIDTS"];

    if (basePsid) {
        const cacheFile = getCookiesCachePath(baseCookies, verbose);
        if (cacheFile) {
            try {
                const content = await fs.readFile(cacheFile, 'utf-8');
                if (content.trim()) {
                    const cookiesData = JSON.parse(content);
                    const jar: Record<string, string> = { ...baseCookies };
                    for (const cookie of cookiesData) {
                        if (cookie.expires && new Date(cookie.expires).getTime() < Date.now()) {
                            continue;
                        }
                        jar[cookie.name] = cookie.value;
                    }
                    cookieJarsToTest.push([jar, "Cache"]);
                    const psidts = jar["__Secure-1PSIDTS"] || "";
                    if (!triedSessions[basePsid]) triedSessions[basePsid] = new Set();
                    triedSessions[basePsid].add(psidts);
                }
            } catch (e) {
                if (verbose) logger.debug(`Skipping cached cookies: ${e}`);
            }
        }
    }

    if (!basePsid) {
        try {
            const cacheDir = getCookieCacheDir();
            const files = await fs.readdir(cacheDir);
            const cacheFiles = files.filter((f: string) => f.startsWith('.cached_cookies_') && f.endsWith('.json'));
            if (cacheFiles.length > 0) {
                // simple latest file logic
                let latestFile = cacheFiles[0];
                let latestTime = 0;
                for (const file of cacheFiles) {
                    const stat = await fs.stat(path.join(cacheDir, file));
                    if (stat.mtimeMs > latestTime) {
                        latestTime = stat.mtimeMs;
                        latestFile = file;
                    }
                }

                const psid = latestFile.substring(16, latestFile.length - 5);
                const content = await fs.readFile(path.join(cacheDir, latestFile), 'utf-8');
                if (content.trim()) {
                    const cookiesData = JSON.parse(content);
                    const jar: Record<string, string> = {};
                    for (const cookie of cookiesData) {
                        if (cookie.expires && new Date(cookie.expires).getTime() < Date.now()) {
                            continue;
                        }
                        jar[cookie.name] = cookie.value;
                    }
                    cookieJarsToTest.push([jar, "Cache (Latest)"]);
                    const psidts = jar["__Secure-1PSIDTS"] || "";
                    if (!triedSessions[psid]) triedSessions[psid] = new Set();
                    triedSessions[psid].add(psidts);
                }
            }
        } catch (e) {}
    }

    if (basePsid) {
        const psidts = basePsidts || "";
        if (!triedSessions[basePsid]?.has(psidts)) {
            cookieJarsToTest.push([{ ...baseCookies }, "Base Cookies"]);
            if (!triedSessions[basePsid]) triedSessions[basePsid] = new Set();
            triedSessions[basePsid].add(psidts);
        }
    }

    // Try browser cookies
    try {
        const browserCookies = await loadBrowserCookies("google.com", verbose);
        for (const [browser, cookieList] of Object.entries(browserCookies)) {
            const tempCookies: Record<string, string> = {};
            for (const c of cookieList) tempCookies[c.name] = c.value;

            const secure1psid = tempCookies["__Secure-1PSID"];
            const secure1psidts = tempCookies["__Secure-1PSIDTS"] || "";

            if (secure1psid) {
                if (basePsid && basePsid !== secure1psid) continue;
                if (!triedSessions[secure1psid]?.has(secure1psidts)) {
                    cookieJarsToTest.push([{ "__Secure-1PSID": secure1psid, "__Secure-1PSIDTS": secure1psidts }, `Browser (${browser})`]);
                    if (!triedSessions[secure1psid]) triedSessions[secure1psid] = new Set();
                    triedSessions[secure1psid].add(secure1psidts);
                }
            }
        }
    } catch (e) {}

    let currentAttempt = 0;
    for (const [jar, groupName] of cookieJarsToTest) {
        currentAttempt++;
        try {
            const response = await sendRequest(client, jar, verbose);
            const text = response.data as string;

            const accessTokenMatch = text.match(/"SNlM0e":\s*"(.*?)"/);
            const buildLabelMatch = text.match(/"cfb2h":\s*"(.*?)"/);
            const sessionIdMatch = text.match(/"FdrFJe":\s*"(.*?)"/);
            const languageMatch = text.match(/"TuX5cc":\s*"(.*?)"/);
            const pushIdMatch = text.match(/"qKIAYe":\s*"(.*?)"/);

            if (accessTokenMatch || buildLabelMatch || sessionIdMatch || languageMatch || pushIdMatch) {
                if (verbose) {
                    logger.debug(`Init attempt (${currentAttempt}) from ${groupName} succeeded.`);
                }
                return [
                    accessTokenMatch ? accessTokenMatch[1] : null,
                    buildLabelMatch ? buildLabelMatch[1] : null,
                    sessionIdMatch ? sessionIdMatch[1] : null,
                    languageMatch ? languageMatch[1] : null,
                    pushIdMatch ? pushIdMatch[1] : null,
                    client,
                    jar
                ];
            }
        } catch (e) {
            if (verbose) {
                logger.debug(`Init attempt (${currentAttempt}) from ${groupName} failed.`);
            }
        }
    }

    throw new AuthError(`Failed to initialize client after ${currentAttempt} attempts. SECURE_1PSIDTS could get expired frequently, please make sure cookie values are up to date.`);
}
