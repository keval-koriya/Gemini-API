import { createHash } from 'crypto';
import * as path from 'path';
import { promises as fs } from 'fs';
import mime from 'mime-types';
import axios, { AxiosInstance } from 'axios';
import { Headers } from '../constants.js';
import { logger } from '../utils/logger.js';

export class Image {
    url: string;
    title: string;
    alt: string;
    proxy: string | null;
    client: AxiosInstance | null;
    _defaultFilenameSuffix: string = "image";

    constructor(
        url: string,
        title: string = "[Image]",
        alt: string = "",
        proxy: string | null = null,
        client: AxiosInstance | null = null
    ) {
        this.url = url;
        this.title = title;
        this.alt = alt;
        this.proxy = proxy;
        this.client = client;
    }

    _getUrlForHash(): string {
        return this.url;
    }

    async save(
        savePath: string = "temp",
        filename: string | null = null,
        verbose: boolean = false,
        client: AxiosInstance | null = null,
        kwargs: Record<string, any> = {}
    ): Promise<string> {
        if (!filename || !path.extname(filename)) {
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const urlHash = createHash('sha256').update(this._getUrlForHash()).digest('hex').substring(0, 10);
            const baseName = filename ? path.parse(filename).name : this._defaultFilenameSuffix;
            filename = `${timestamp}_${urlHash}_${baseName}`;
        }

        const reqClient = client || this.client || axios.create({ proxy: false });

        await fs.mkdir(savePath, { recursive: true });
        return await this._performSave(reqClient, savePath, filename, verbose, kwargs);
    }

    async _performSave(
        reqClient: AxiosInstance,
        savePath: string,
        filename: string,
        verbose: boolean,
        kwargs: Record<string, any>
    ): Promise<string> {
        const response = await reqClient.get(this.url, {
            headers: Headers.REFERER,
            responseType: 'arraybuffer',
            validateStatus: () => true
        });

        if (verbose) {
            logger.debug(`HTTP Request: GET ${this.url} [${response.status}]`);
        }

        if (response.status === 200) {
            if (!path.extname(filename)) {
                const contentType = ((response.headers['content-type'] as string) || '').split(';')[0].trim().toLowerCase();
                const ext = mime.extension(contentType) || 'png';
                filename = `${filename}.${ext}`;
            }

            const dest = path.join(savePath, filename);
            await fs.writeFile(dest, response.data);

            if (verbose) {
                logger.info(`Image saved as ${path.resolve(dest)}`);
            }

            return path.resolve(dest);
        } else {
            throw new Error(`Error downloading image: ${response.status} ${response.statusText}`);
        }
    }
}

export class WebImage extends Image {}

export class GeneratedImage extends Image {
    clientRef: any = null;
    cid: string = "";
    rid: string = "";
    rcid: string = "";
    imageId: string = "";

    constructor(
        url: string,
        title: string = "[Image]",
        alt: string = "",
        proxy: string | null = null,
        client: AxiosInstance | null = null,
        clientRef: any = null,
        cid: string = "",
        rid: string = "",
        rcid: string = "",
        imageId: string = ""
    ) {
        super(url, title, alt, proxy, client);
        this.clientRef = clientRef;
        this.cid = cid;
        this.rid = rid;
        this.rcid = rcid;
        this.imageId = imageId;
    }

    async _performSave(
        reqClient: AxiosInstance,
        savePath: string,
        filename: string,
        verbose: boolean,
        kwargs: Record<string, any>
    ): Promise<string> {
        const fullSize = kwargs.fullSize !== undefined ? kwargs.fullSize : true;

        if (fullSize) {
            if (this.clientRef && this.cid && this.rid && this.rcid && this.imageId) {
                try {
                    const originalUrl = await this.clientRef._getFullSizeImage(this.cid, this.rid, this.rcid, this.imageId);
                    if (originalUrl) {
                        const reqUrl = `${originalUrl}=d-I?alr=yes`;
                        const res1 = await reqClient.get(reqUrl, { headers: Headers.REFERER, responseType: 'text' });
                        if (res1.status >= 200 && res1.status < 300) {
                            const res2 = await reqClient.get(res1.data, { headers: Headers.REFERER, responseType: 'text' });
                            if (res2.status >= 200 && res2.status < 300) {
                                this.url = res2.data;
                                return await super._performSave(reqClient, savePath, filename, verbose, kwargs);
                            }
                        }
                    }
                } catch (e) {
                    logger.debug(`Failed to fetch full size image URL via RPC: ${e}, falling back to default URL suffix.`);
                }
            }

            if (this.url.includes("=s1024-rj")) {
                this.url = this.url.replace("=s1024-rj", "=s2048-rj");
            } else if (!this.url.includes("=s2048-rj")) {
                this.url += "=s2048-rj";
            }
        } else {
            if (this.url.includes("=s2048-rj")) {
                this.url = this.url.replace("=s2048-rj", "=s1024-rj");
            } else if (!this.url.includes("=s1024-rj")) {
                this.url += "=s1024-rj";
            }
        }

        return await super._performSave(reqClient, savePath, filename, verbose, kwargs);
    }
}
