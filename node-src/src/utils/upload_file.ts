import * as path from 'path';
import { promises as fs } from 'fs';
import mime from 'mime-types';
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { logger } from './logger.js';
import { Endpoint, Headers } from '../constants.js';

export function generateRandomName(extension: string = ".txt"): string {
    const randomInt = Math.floor(Math.random() * 9000000) + 1000000;
    return `input_${randomInt}${extension}`;
}

export async function uploadFile(
    file: string | Buffer | any, // Stream or string path or buffer
    client: AxiosInstance,
    pushId: string,
    filename: string | null = null,
    verbose: boolean = false
): Promise<string> {
    let fileContent: Buffer | string | any;
    let finalFilename: string;

    if (typeof file === 'string') {
        const filePath = path.resolve(file);
        try {
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) throw new Error();
        } catch {
            throw new Error(`${filePath} is not a valid file.`);
        }
        finalFilename = filename || path.basename(filePath);
        fileContent = await fs.readFile(filePath);
    } else if (Buffer.isBuffer(file)) {
        fileContent = file;
        finalFilename = filename || generateRandomName();
    } else if (typeof file === 'object' && typeof file.read === 'function') {
        // Assume stream
        fileContent = file;
        finalFilename = filename || generateRandomName();
    } else {
        throw new Error(`Unsupported file type: ${typeof file}`);
    }

    const contentType = mime.lookup(finalFilename) || "application/octet-stream";

    const formData = new FormData();
    formData.append("file", fileContent, {
        filename: finalFilename,
        contentType: contentType
    });

    const requestHeaders = {
        ...Headers.REFERER,
        ...Headers.UPLOAD,
        "Push-ID": pushId,
        ...formData.getHeaders()
    };

    try {
        const response = await client.post(Endpoint.UPLOAD, formData, {
            headers: requestHeaders,
            validateStatus: () => true
        });

        if (verbose) {
            logger.debug(`HTTP Request: POST ${Endpoint.UPLOAD} [${response.status}]`);
        }

        if (response.status >= 400) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        return response.data;
    } catch (e) {
        throw e;
    }
}

export function parseFileName(file: string | Buffer | any): string {
    if (typeof file === 'string') {
        return path.basename(file);
    }
    return generateRandomName();
}
