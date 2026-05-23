import dgram from 'dgram';
import fs from 'fs';
import path from 'path';

const MAGIC = 'PGUV';
const HEADER_FIXED_BYTES = 25;

interface SegmentState {
    fd: number;
    filepath: string;
    totalSize: number;
    receivedBytes: number;
}

export class UdpVideoReceiver {
    private socket = dgram.createSocket('udp4');
    private segments = new Map<string, SegmentState>();

    constructor(
        private readonly outputDir: string,
        private readonly port: number
    ) {}

    start(): void {
        this.socket.on('message', (message) => this.handleMessage(message));
        this.socket.on('error', (err) => {
            console.error('[UDP video] socket error:', err);
        });
        this.socket.bind(this.port, '0.0.0.0', () => {
            console.log(`[UDP video] Listening on port ${this.port}`);
        });
    }

    close(): void {
        for (const segment of this.segments.values()) {
            fs.closeSync(segment.fd);
        }
        this.segments.clear();
        this.socket.close();
    }

    private handleMessage(message: Buffer): void {
        const packet = this.parsePacket(message);
        if (!packet) return;

        const eventDir = path.join(process.cwd(), this.outputDir, packet.eventId);
        fs.mkdirSync(eventDir, { recursive: true });

        const key = `${packet.eventId}:${packet.segmentIndex}`;
        let segment = this.segments.get(key);

        if (!segment) {
            const filepath = path.join(
                eventDir,
                `video_chunk_${String(packet.segmentIndex).padStart(4, '0')}.bin`
            );
            segment = {
                fd: fs.openSync(filepath, 'w'),
                filepath,
                totalSize: packet.totalSize,
                receivedBytes: 0,
            };
            this.segments.set(key, segment);
            console.log(
                `[UDP video] Receiving event=${packet.eventId} segment=${packet.segmentIndex} size=${packet.totalSize}`
            );
        }

        fs.writeSync(segment.fd, packet.payload, 0, packet.payload.length, packet.offset);
        segment.receivedBytes += packet.payload.length;

        if (segment.receivedBytes >= segment.totalSize) {
            fs.closeSync(segment.fd);
            this.segments.delete(key);
            console.log(`[UDP video] Completed ${segment.filepath}`);
        }
    }

    private parsePacket(message: Buffer):
        | {
            eventId: string;
            segmentIndex: number;
            offset: number;
            totalSize: number;
            payload: Buffer;
        }
        | null {
        if (message.length < HEADER_FIXED_BYTES) {
            console.warn('[UDP video] packet too small');
            return null;
        }

        if (message.subarray(0, 4).toString('ascii') !== MAGIC) {
            console.warn('[UDP video] invalid magic');
            return null;
        }

        const eventIdLength = message.readUInt8(4);
        const headerBytes = HEADER_FIXED_BYTES + eventIdLength;
        if (message.length < headerBytes) {
            console.warn('[UDP video] truncated header');
            return null;
        }

        const eventId = message.subarray(HEADER_FIXED_BYTES, headerBytes).toString('utf-8');
        if (!/^[A-Za-z0-9._-]+$/.test(eventId)) {
            console.warn(`[UDP video] invalid event id: ${eventId}`);
            return null;
        }

        return {
            segmentIndex: message.readUInt32BE(5),
            offset: Number(message.readBigUInt64BE(9)),
            totalSize: Number(message.readBigUInt64BE(17)),
            eventId,
            payload: message.subarray(headerBytes),
        };
    }
}
