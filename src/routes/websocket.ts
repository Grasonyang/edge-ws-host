import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
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

export default async function websocketRoutes(fastify: FastifyInstance) {
    fastify.get('/ws', { websocket: true }, (connection, req: FastifyRequest) => {
        // @ts-ignore
        const socket = connection as WebSocket;
        // @ts-ignore - Fastify types for query string
        const sensorId = req.query.id as string | undefined;
        
        console.log(`[WS] Client connected. SensorId: ${sensorId}`);
        
        if (sensorId) {
            SensorManager.getInstance().register(sensorId, socket);
        }

        const session: ClientSession = { sensorId };

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

            switch(opCode) {
                case PacketOpCode.START:
                    session.eventId = payload.toString('utf-8');
                    console.log(`[WS] Start stream for event: ${session.eventId}, Sensor: ${session.sensorId}`);
                    
                    if (appConfig.streamType === 'ffmpeg') {
                        session.streamer = new FFmpegStreamer(session.eventId, appConfig.outputDir);
                    } else {
                        session.streamer = new FileStreamer(session.eventId, appConfig.outputDir);
                    }
                    break;
                
                case PacketOpCode.DATA:
                    if (!session.streamer) {
                        console.error('[WS] Received data before START packet');
                        return;
                    }

                    const canContinue = session.streamer.write(payload);
                    
                    if (!canContinue) {
                        socket.pause();
                        console.warn('[WS] Backpressure applied (Simulated)');
                        setTimeout(() => socket.resume(), 100);
                    }
                    break;

                case PacketOpCode.END:
                    console.log(`[WS] End stream for event: ${session.eventId}, Sensor: ${session.sensorId}`);
                    if (session.streamer) {
                        session.streamer.end();
                        session.streamer = undefined;
                    }
                    break;

                default:
                 console.warn(`[WS] Unknown OpCode: ${opCode}`);
            }
        });

        socket.on('close', () => {
            console.log(`[WS] Client disconnected. SensorId: ${session.sensorId}`);
            if (session.sensorId) {
                SensorManager.getInstance().unregister(session.sensorId);
            }
            if (session.streamer) {
                console.log(`[WS] Cleaning up incomplete stream for event: ${session.eventId}`);
                session.streamer.end();
            }
        });
        
        socket.on('error', (err: Error) => {
            console.error('[WS] Error:', err);
        });
    });
}
