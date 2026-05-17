import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import websocketRoutes from './routes/websocket.js';

const fastify = Fastify({
    logger: true
});

async function start() {
    try {
        await fastify.register(fastifyWebsocket);
        await fastify.register(websocketRoutes);

        const port = Number(process.env.PORT) || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`[Server] Listening on port ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();