export const config = {
    streamType: (process.env.STREAM_TYPE as 'ffmpeg' | 'file') || 'ffmpeg',
    outputDir: process.env.OUTPUT_DIR || './recordings',
};
