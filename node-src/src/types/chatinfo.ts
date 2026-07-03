export class ChatInfo {
    cid: string;
    title: string;
    isPinned: boolean;
    timestamp: number;

    constructor(
        cid: string,
        title: string,
        timestamp: number,
        isPinned: boolean = false
    ) {
        this.cid = cid;
        this.title = title;
        this.timestamp = timestamp;
        this.isPinned = isPinned;
    }

    toString(): string {
        const pin = this.isPinned ? "[Pinned] " : "";
        const titleStr = this.title || `Chat(${this.cid})`;
        const dt = new Date(this.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19);
        return `${pin}${titleStr} (${dt})`;
    }
}
