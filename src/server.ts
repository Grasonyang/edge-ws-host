import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import websocketRoutes from './routes/websocket.js';
import { config as appConfig } from '../config/default.js';
import { UdpVideoReceiver } from './utils/udp-video-receiver.js';

const fastify = Fastify({
    logger: true
});
const udpVideoReceiver = appConfig.udpVideoEnabled
    ? new UdpVideoReceiver(appConfig.outputDir, appConfig.udpVideoPort)
    : null;

async function start() {
    try {
        await fastify.register(fastifyWebsocket);
        await fastify.register(websocketRoutes);
        udpVideoReceiver?.start();

        const port = Number(process.env.PORT) || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`[Server] Listening on port ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();

process.on('SIGINT', async () => {
    udpVideoReceiver?.close();
    await fastify.close();
    process.exit(0);
});
