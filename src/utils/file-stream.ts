import fs from 'fs';
import path from 'path';

/**
 * FileStreamer — v1 chunk-per-packet writer aligned with ws_pipeline_dispatcher.
 *
 * Each DATA packet payload becomes a separate file `chunk_NNNN.bin`, and each
 * JSON packet payload becomes `chunk_NNNN.json` (seq shared, monotonically
 * increasing). This matches the chunk-naming contract in
 * `ws_pipeline_dispatcher/.docs/full_spec.md` §3.1.2 and lets `stream_merge`
 * parse seq directly from the filename (no binary header).
 *
 * After `end()` resolves, callers should create the sentinel file
 * `.pipeline_end` in `getEventDir()` so the downstream pipeline can flush
 * and exit cleanly.
 */
export class FileStreamer {
    private eventDir: string;
    private seq: number = 0;
    private pendingWrites: number = 0;
    private endResolver: (() => void) | null = null;

    constructor(eventId: string, outputDir: string) {
        this.eventDir = path.join(process.cwd(), outputDir, eventId);
        if (!fs.existsSync(this.eventDir)) {
            fs.mkdirSync(this.eventDir, { recursive: true });
        }
    }

    getEventDir(): string {
        return this.eventDir;
    }

    /**
     * Write a raw binary chunk (corresponds to a DATA packet).
     * Returns true to indicate the caller can continue without backpressure;
     * since each chunk is its own fs.writeFile, we never need to pause.
     */
    write(chunk: Buffer): boolean {
        const filename = `chunk_${String(this.seq).padStart(4, '0')}.bin`;
        this.seq += 1;
        this.persist(path.join(this.eventDir, filename), chunk);
        return true;
    }

    /**
     * Write a JSON metadata chunk (corresponds to a JSON packet).
     */
    writeJson(jsonPayload: Buffer | string): void {
        const filename = `chunk_${String(this.seq).padStart(4, '0')}.json`;
        this.seq += 1;
        const buf = typeof jsonPayload === 'string'
            ? Buffer.from(jsonPayload, 'utf-8')
            : jsonPayload;
        this.persist(path.join(this.eventDir, filename), buf);
    }

    private persist(filepath: string, data: Buffer): void {
        this.pendingWrites += 1;
        fs.writeFile(filepath, data, (err) => {
            if (err) {
                console.error(`[FileStreamer] Error writing ${filepath}:`, err.message);
            }
            this.pendingWrites -= 1;
            if (this.pendingWrites === 0 && this.endResolver) {
                const r = this.endResolver;
                this.endResolver = null;
                r();
            }
        });
    }

    /**
     * Resolve once every queued chunk has hit disk. Callers (e.g. the WS
     * handler) should await this before creating `.pipeline_end` or
     * spawning the dispatcher.
     */
    end(): Promise<void> {
        if (this.pendingWrites === 0) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.endResolver = resolve;
        });
    }
}
