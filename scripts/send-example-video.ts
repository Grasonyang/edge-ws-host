import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { PacketOpCode } from '../src/types/index.js';

const MAGIC = 'PGUV';
const HEADER_FIXED_BYTES = 25;
const MB = 1024 * 1024;

const wsUrl = process.env.WS_URL || 'ws://127.0.0.1:3000/ws?id=simulator';
const udpHost = process.env.UDP_HOST || '127.0.0.1';
const udpPort = parseInt(process.env.UDP_VIDEO_PORT || '4000', 10);
const segmentBytes = parseInt(process.env.SEGMENT_BYTES || String(100 * MB), 10);
const datagramPayloadBytes = parseInt(process.env.UDP_PAYLOAD_BYTES || '32768', 10);
const durationMs = parseInt(process.env.DURATION_MS || '30000', 10);
const minSleepMs = parseInt(process.env.MIN_SLEEP_MS || '0', 10);
const maxSleepMs = parseInt(process.env.MAX_SLEEP_MS || '8', 10);
const eventId = process.env.EVENT_ID || `sim-${Date.now()}`;
const inputPath = process.env.INPUT_MP4 || findExampleMp4();

function findExampleMp4(): string {
    const dataDir = path.join(process.cwd(), 'scripts', 'data');
    const match = fs.readdirSync(dataDir).find((name) => name.toLowerCase().endsWith('.mp4'));
    if (!match) {
        throw new Error(`No .mp4 file found in ${dataDir}`);
    }
    return path.join(dataDir, match);
}

function encodeWsPacket(opCode: PacketOpCode, payload: Buffer | string): Buffer {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8');
    const header = Buffer.alloc(8);
    header.write(opCode, 0, 4, 'ascii');
    header.writeUInt32BE(body.length, 4);
    return Buffer.concat([header, body]);
}

function encodeUdpPacket(
    segmentIndex: number,
    offset: number,
    totalSize: number,
    payload: Buffer
): Buffer {
    const eventIdBuffer = Buffer.from(eventId, 'utf-8');
    if (eventIdBuffer.length > 255) {
        throw new Error('EVENT_ID must fit within 255 bytes');
    }

    const header = Buffer.alloc(HEADER_FIXED_BYTES + eventIdBuffer.length);
    header.write(MAGIC, 0, 4, 'ascii');
    header.writeUInt8(eventIdBuffer.length, 4);
    header.writeUInt32BE(segmentIndex, 5);
    header.writeBigUInt64BE(BigInt(offset), 9);
    header.writeBigUInt64BE(BigInt(totalSize), 17);
    eventIdBuffer.copy(header, HEADER_FIXED_BYTES);
    return Buffer.concat([header, payload]);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSleepMs(): number {
    if (maxSleepMs <= minSleepMs) return minSleepMs;
    return minSleepMs + Math.floor(Math.random() * (maxSleepMs - minSleepMs + 1));
}

function sendUdp(socket: dgram.Socket, packet: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
        socket.send(packet, udpPort, udpHost, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function openWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
    });
}

async function sendSegment(
    socket: dgram.Socket,
    fd: number,
    fileSize: number,
    fileOffset: number,
    segmentIndex: number
): Promise<number> {
    const segmentSize = Math.min(segmentBytes, fileSize - fileOffset);
    const buffer = Buffer.allocUnsafe(datagramPayloadBytes);
    let segmentOffset = 0;

    console.log(`[sim] sending segment=${segmentIndex} fileOffset=${fileOffset} size=${segmentSize}`);

    while (segmentOffset < segmentSize) {
        const bytesToRead = Math.min(datagramPayloadBytes, segmentSize - segmentOffset);
        const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, fileOffset + segmentOffset);

        if (bytesRead <= 0) break;

        const packet = encodeUdpPacket(
            segmentIndex,
            segmentOffset,
            segmentSize,
            buffer.subarray(0, bytesRead)
        );
        await sendUdp(socket, packet);
        await sleep(randomSleepMs());

        segmentOffset += bytesRead;
    }

    console.log(`[sim] completed segment=${segmentIndex}`);
    return fileOffset + segmentSize >= fileSize ? 0 : fileOffset + segmentSize;
}

async function main(): Promise<void> {
    const stat = fs.statSync(inputPath);
    const deadline = Date.now() + durationMs;
    const ws = await openWebSocket();
    const udp = dgram.createSocket('udp4');
    const fd = fs.openSync(inputPath, 'r');

    console.log(`[sim] event=${eventId}`);
    console.log(`[sim] input=${inputPath}`);
    console.log(`[sim] ws=${wsUrl}`);
    console.log(`[sim] udp=${udpHost}:${udpPort}`);
    console.log(`[sim] durationMs=${durationMs} segmentBytes=${segmentBytes}`);

    ws.send(encodeWsPacket(PacketOpCode.START, eventId));
    ws.send(encodeWsPacket(PacketOpCode.JSON, JSON.stringify({
        eventId,
        inputPath,
        fileSize: stat.size,
        segmentBytes,
        datagramPayloadBytes,
        durationMs,
        ordered: true,
    })));

    let fileOffset = 0;
    let segmentIndex = 0;

    try {
        while (Date.now() < deadline) {
            fileOffset = await sendSegment(udp, fd, stat.size, fileOffset, segmentIndex);
            segmentIndex += 1;
        }
    } finally {
        fs.closeSync(fd);
        udp.close();
    }

    ws.send(encodeWsPacket(PacketOpCode.END, Buffer.alloc(0)));
    await sleep(250);
    ws.close();
    console.log(`[sim] done segments=${segmentIndex}`);
}

main().catch((err) => {
    console.error('[sim] failed:', err);
    process.exit(1);
});
