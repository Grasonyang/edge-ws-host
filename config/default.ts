export const config = {
    streamType: (process.env.STREAM_TYPE as 'ffmpeg' | 'file') || 'ffmpeg',
    outputDir: process.env.OUTPUT_DIR || './recordings',
    udpVideoPort: parseInt(process.env.UDP_VIDEO_PORT || '4000', 10),
    udpVideoEnabled: process.env.UDP_VIDEO_ENABLED !== 'false',

    // ws_pipeline_dispatcher integration (see edge-ws-host ↔ ws_pipeline_dispatcher contract)
    dispatcherBin: process.env.DISPATCHER_BIN || './pipeline_dispatcher',
    dispatcherEnabled: process.env.DISPATCHER_ENABLED !== 'false',
    clipsDbPath: process.env.CLIPS_DB_PATH || '/tmp/clips.db',
    ttlSeconds: parseInt(process.env.TTL_SECONDS || '300', 10),
};
