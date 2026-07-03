import { createHash } from 'crypto';
import * as path from 'path';
import { promises as fs } from 'fs';
import mime from 'mime-types';
import axios, { AxiosInstance } from 'axios';
import { Headers } from '../constants.js';
import { logger } from '../utils/logger.js';

export class Video {
    url: string;
    title: string;
    proxy: string | null;
    client: AxiosInstance | null;
    _defaultFilenameSuffix: string = "video";

    constructor(
        url: string,
        title: string = "[Video]",
        proxy: string | null = null,
        client: AxiosInstance | null = null
    ) {
        this.url = url;
        this.title = title;
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
    ): Promise<Record<string, string | null>> {
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
    ): Promise<Record<string, string | null>> {
        const file = await Video._downloadFile(reqClient, this.url, savePath, filename, ".mp4", verbose);
        return { video: file, video_thumbnail: null };
    }

    static async _downloadFile(
        reqClient: AxiosInstance,
        url: string,
        savePath: string,
        filename: string,
        defaultExt: string = ".mp4",
        verbose: boolean = false
    ): Promise<string | null> {
        const response = await reqClient.get(url, {
            headers: Headers.REFERER,
            responseType: 'arraybuffer',
            validateStatus: () => true
        });

        if (verbose) {
            logger.debug(`HTTP Request: GET ${url} [${response.status}]`);
        }

        if (response.status === 200) {
            if (!path.extname(filename)) {
                const contentType = ((response.headers['content-type'] as string) || '').split(';')[0].trim().toLowerCase();
                const ext = mime.extension(contentType) || defaultExt.substring(1);
                filename = `${filename}.${ext}`;
            }

            const dest = path.join(savePath, filename);
            await fs.writeFile(dest, response.data);

            if (verbose) {
                logger.info(`File saved as ${path.resolve(dest)}`);
            }

            return path.resolve(dest);
        } else if (response.status === 206) {
            return "206";
        } else {
            throw new Error(`Error downloading file: ${response.status} ${response.statusText}`);
        }
    }
}

export class GeneratedVideo extends Video {
    clientRef: any = null;
    thumbnail: string = "";
    cid: string = "";
    rid: string = "";
    rcid: string = "";

    constructor(
        url: string,
        title: string = "[Video]",
        proxy: string | null = null,
        client: AxiosInstance | null = null,
        clientRef: any = null,
        thumbnail: string = "",
        cid: string = "",
        rid: string = "",
        rcid: string = ""
    ) {
        super(url, title, proxy, client);
        this.clientRef = clientRef;
        this.thumbnail = thumbnail;
        this.cid = cid;
        this.rid = rid;
        this.rcid = rcid;
    }

    async _performSave(
        reqClient: AxiosInstance,
        savePath: string,
        filename: string,
        verbose: boolean,
        kwargs: Record<string, any>
    ): Promise<Record<string, string | null>> {
        let thumbPath: string | null = null;
        if (this.thumbnail) {
            const thumbBase = path.parse(filename).name;
            try {
                thumbPath = await Video._downloadFile(reqClient, this.thumbnail, savePath, thumbBase, ".jpg", verbose);
            } catch (e) {
                if (verbose) {
                    logger.warn(`Failed to save thumbnail: ${e}`);
                }
            }
        }

        while (true) {
            const videoPath = await Video._downloadFile(reqClient, this.url, savePath, filename, ".mp4", verbose);
            if (videoPath === "206") {
                if (verbose) {
                    logger.info("Video still generating (206), retrying in 10s...");
                }
                await new Promise(r => setTimeout(r, 10000));
            } else {
                return { video: videoPath, video_thumbnail: thumbPath };
            }
        }
    }
}

export class GeneratedMedia extends GeneratedVideo {
    mp3Url: string = "";
    mp3Thumbnail: string = "";
    _defaultFilenameSuffix: string = "media";

    constructor(
        url: string,
        title: string = "[Media]",
        proxy: string | null = null,
        client: AxiosInstance | null = null,
        clientRef: any = null,
        thumbnail: string = "",
        cid: string = "",
        rid: string = "",
        rcid: string = "",
        mp3Url: string = "",
        mp3Thumbnail: string = ""
    ) {
        super(url, title, proxy, client, clientRef, thumbnail, cid, rid, rcid);
        this.mp3Url = mp3Url;
        this.mp3Thumbnail = mp3Thumbnail;
    }

    _getUrlForHash(): string {
        return this.url || this.mp3Url;
    }

    get mp4Url(): string { return this.url; }
    set mp4Url(value: string) { this.url = value; }
    get mp4Thumbnail(): string { return this.thumbnail; }
    set mp4Thumbnail(value: string) { this.thumbnail = value; }

    async _performSave(
        reqClient: AxiosInstance,
        savePath: string,
        filename: string,
        verbose: boolean,
        kwargs: Record<string, any>
    ): Promise<Record<string, string | null>> {
        const downloadType: "audio" | "video" | "both" = kwargs.downloadType || "both";
        const results: Record<string, string | null> = {};
        const tasks: Promise<[string, string | null]>[] = [];

        if (["audio", "both"].includes(downloadType) && this.mp3Url) {
            tasks.push(GeneratedMedia._downloadWithPolling(reqClient, this.mp3Url, savePath, filename, ".mp3", verbose, "audio"));
            if (this.mp3Thumbnail) {
                tasks.push(GeneratedMedia._downloadThumbnail(reqClient, this.mp3Thumbnail, savePath, filename + "_audio_thumb", verbose, "audio_thumbnail"));
            }
        }

        if (["video", "both"].includes(downloadType) && this.url) {
            tasks.push(GeneratedMedia._downloadWithPolling(reqClient, this.url, savePath, filename, ".mp4", verbose, "video"));
            if (this.thumbnail) {
                tasks.push(GeneratedMedia._downloadThumbnail(reqClient, this.thumbnail, savePath, filename + "_video_thumb", verbose, "video_thumbnail"));
            }
        }

        const downloaded = await Promise.all(tasks);
        for (const [key, filePath] of downloaded) {
            results[key] = filePath;
        }

        return results;
    }

    static async _downloadWithPolling(
        reqClient: AxiosInstance,
        url: string,
        savePath: string,
        filename: string,
        ext: string,
        verbose: boolean,
        key: string
    ): Promise<[string, string | null]> {
        while (true) {
            const file = await Video._downloadFile(reqClient, url, savePath, filename, ext, verbose);
            if (file === "206") {
                if (verbose) {
                    logger.info(`Media (${key}) still generating (206), retrying in 10s...`);
                }
                await new Promise(r => setTimeout(r, 10000));
            } else {
                return [key, file];
            }
        }
    }

    static async _downloadThumbnail(
        reqClient: AxiosInstance,
        url: string,
        savePath: string,
        filename: string,
        verbose: boolean,
        key: string
    ): Promise<[string, string | null]> {
        try {
            const file = await Video._downloadFile(reqClient, url, savePath, filename, ".jpg", verbose);
            return [key, file];
        } catch (e) {
            if (verbose) {
                logger.warn(`Failed to save thumbnail (${key}): ${e}`);
            }
            return [key, null];
        }
    }
}
