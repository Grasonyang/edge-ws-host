import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PacketOpCode } from '../types/index.js';
import { FFmpegStreamer } from '../utils/ffmpeg-stream.js';
import { FileStreamer } from '../utils/file-stream.js';
import { config as appConfig } from '../../config/default.js';
import { SensorManager } from '../utils/sensor-manager.js';

interface ClientSession {
    streamer?: FFmpegStreamer | FileStreamer | undefined;
    eventId?: string | undefined;
    sensorId?: string | undefined;
}

/**
 * Spawn ws_pipeline_dispatcher for a finished session.
 *
 * Contract (see ws_pipeline_dispatcher/.docs/full_spec.md §3.1.3):
 *   1. The sentinel `.pipeline_end` must already exist inside eventDir.
 *   2. argv = [session_id, src_dir, db_path, ttl_seconds]
 *   3. dispatcher writes diagnostics to stderr only; stdout is reserved.
 */
function spawnDispatcher(eventId: string, eventDir: string) {
    if (!appConfig.dispatcherEnabled) {
        console.log(`[WS] dispatcher disabled, skip spawn for event=${eventId}`);
        return;
    }
    const proc = spawn(appConfig.dispatcherBin, [
        eventId,
        eventDir,
        appConfig.clipsDbPath,
        String(appConfig.ttlSeconds),
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stderr.on('data', (d: Buffer) => {
        console.warn(`[dispatcher ${eventId}] ${d.toString().trimEnd()}`);
    });
    proc.on('error', (err) => {
        console.error(`[dispatcher ${eventId}] spawn error:`, err.message);
    });
    proc.on('exit', (code, signal) => {
        if (code === 0) {
            console.log(`[dispatcher ${eventId}] completed ok`);
        } else {
            console.error(
                `[dispatcher ${eventId}] failed code=${code} signal=${signal}`
            );
        }
    });
}

export default async function websocketRoutes(fastify: FastifyInstance) {
    const websocketHandler = (connection: unknown, req: FastifyRequest) => {
        // @ts-ignore
        const socket = connection as WebSocket;
        // @ts-ignore - Fastify types for query string
        const sensorId = req.query.id as string | undefined;

        console.log(`[WS] Client connected. SensorId: ${sensorId}`);

        if (sensorId) {
            SensorManager.getInstance().register(sensorId, socket);
        }

        const session: ClientSession = { sensorId };

        // Finalize a session: end the streamer, drop sentinel, spawn dispatcher.
        // Idempotent — safe to call from both END_ handler and close handler.
        let finalized = false;
        const finalize = async (reason: 'end_opcode' | 'ws_close') => {
            if (finalized) return;
            finalized = true;

            const streamer = session.streamer;
            const eventId = session.eventId;
            session.streamer = undefined;

            if (!streamer || !eventId) return;

            try {
                await streamer.end();
            } catch (err) {
                console.error(`[WS] streamer.end() failed:`, err);
            }

            // Resolve event directory uniformly across streamer types.
            const eventDir =
                'getEventDir' in streamer && typeof streamer.getEventDir === 'function'
                    ? streamer.getEventDir()
                    : path.join(process.cwd(), appConfig.outputDir, eventId);

            // 1) Drop sentinel so stream_merge can flush + exit 0.
            try {
                const sentinelPath = path.join(eventDir, '.pipeline_end');
                fs.writeFileSync(sentinelPath, '');
            } catch (err) {
                console.error(`[WS] sentinel write failed for ${eventId}:`, err);
            }

            // 2) Spawn the dispatcher (only on graceful END_, not on abrupt close).
            if (reason === 'end_opcode') {
                spawnDispatcher(eventId, eventDir);
            } else {
                console.warn(
                    `[WS] event=${eventId} closed without END_, skipping dispatcher spawn`
                );
            }
        };

        socket.on('message', (message: Buffer) => {
            if (message.length < 8) {
                console.warn('[WS] Packet too small');
                return;
            }

            const opCode = message.subarray(0, 4).toString('ascii');
            const payloadSize = message.readUInt32BE(4);
            const payload = message.subarray(8);

            if (payload.length !== payloadSize) {
                console.error(`[WS] Payload size mismatch. Expected: ${payloadSize}, Got: ${payload.length}`);
                return;
            }

            switch (opCode) {
                case PacketOpCode.START: {
                    session.eventId = payload.toString('utf-8');
                    console.log(`[WS] Start stream for event: ${session.eventId}, Sensor: ${session.sensorId}`);

                    if (appConfig.streamType === 'ffmpeg') {
                        session.streamer = new FFmpegStreamer(session.eventId, appConfig.outputDir);
                    } else {
                        session.streamer = new FileStreamer(session.eventId, appConfig.outputDir);
                    }
                    break;
                }

                case PacketOpCode.DATA: {
                    if (!session.streamer) {
                        console.error('[WS] Received data before START packet');
                        return;
                    }
                    const canContinue = session.streamer.write(payload);
                    if (!canContinue) {
                        socket.pause();
                        console.warn('[WS] Backpressure applied');
                        setTimeout(() => socket.resume(), 100);
                    }
                    break;
                }

                case PacketOpCode.JSON: {
                    // JSON metadata becomes chunk_NNNN.json under the FileStreamer.
                    if (session.streamer instanceof FileStreamer) {
                        session.streamer.writeJson(payload);
                    } else {
                        console.warn('[WS] JSON packet received but streamer is not FileStreamer; dropping');
                    }
                    break;
                }

                case PacketOpCode.END: {
                    console.log(`[WS] End stream for event: ${session.eventId}, Sensor: ${session.sensorId}`);
                    void finalize('end_opcode');
                    break;
                }

                default:
                    console.warn(`[WS] Unknown OpCode: ${opCode}`);
            }
        });

        socket.on('close', () => {
            console.log(`[WS] Client disconnected. SensorId: ${session.sensorId}`);
            if (session.sensorId) {
                SensorManager.getInstance().unregister(session.sensorId);
            }
            void finalize('ws_close');
        });

        socket.on('error', (err: Error) => {
            console.error('[WS] Error:', err);
        });
    };

    fastify.get('/ws', { websocket: true }, websocketHandler);
    fastify.get('/api/ws', { websocket: true }, websocketHandler);
}
