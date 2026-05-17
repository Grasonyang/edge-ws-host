import { WebSocket } from 'ws';

export class SensorManager {
    private static instance: SensorManager;
    private sensors: Map<string, WebSocket> = new Map();

    private constructor() {}

    public static getInstance(): SensorManager {
        if (!SensorManager.instance) {
            SensorManager.instance = new SensorManager();
        }
        return SensorManager.instance;
    }

    register(sensorId: string, socket: WebSocket) {
        if (this.sensors.has(sensorId)) {
            console.warn(`[SensorManager] Overwriting existing connection for ${sensorId}`);
            this.sensors.get(sensorId)?.close();
        }
        this.sensors.set(sensorId, socket);
        console.log(`[SensorManager] Registered sensor: ${sensorId}. Total sensors: ${this.sensors.size}`);
    }

    unregister(sensorId: string) {
        if (this.sensors.has(sensorId)) {
            this.sensors.delete(sensorId);
            console.log(`[SensorManager] Unregistered sensor: ${sensorId}. Total sensors: ${this.sensors.size}`);
        }
    }

    sendTo(sensorId: string, data: Buffer) {
        const socket = this.sensors.get(sensorId);
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(data);
        } else {
            console.warn(`[SensorManager] Cannot send to ${sensorId}: socket not found or closed`);
        }
    }

    broadcast(data: Buffer) {
        for (const socket of this.sensors.values()) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(data);
            }
        }
    }
}
