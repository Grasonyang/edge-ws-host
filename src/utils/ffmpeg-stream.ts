import ffmpeg from 'fluent-ffmpeg';
import { Writable } from 'stream';
import fs from 'fs';
import path from 'path';

export class FFmpegStreamer {
  private command: ffmpeg.FfmpegCommand;
  private passThrough: Writable;
  private outputPath: string;

  constructor(eventId: string, outputDir: string, options: string[] = ['-vcodec copy']) { // 預設使用 copy 避免 CPU 過載
    const eventDir = path.join(process.cwd(), outputDir, eventId);
    if (!fs.existsSync(eventDir)) {
      fs.mkdirSync(eventDir, { recursive: true });
    }

    this.outputPath = path.join(eventDir, 'output.mp4'); // 或根據來源動態調整副檔名

    // 建立一個 Writable stream 作為緩衝，以便處理背壓
    this.passThrough = new Writable({
      write(chunk, encoding, callback) {
        // 此處實作背壓邏輯
        // ffmpeg command 會消費這個 stream
        callback();
      }
    });

    this.command = ffmpeg()
      .input(this.passThrough as any) // TODO: 修正型別問題
      .inputOptions(['-f mjpeg']) // 假設輸入是 mjpeg，可以根據實際情況調整
      .outputOptions(options)
      .output(this.outputPath)
      .on('start', (cmd) => {
        console.log(`[FFmpeg] Started processing event ${eventId}. Command: ${cmd}`);
      })
      .on('error', (err) => {
        console.error(`[FFmpeg] Error on event ${eventId}:`, err.message);
      })
      .on('end', () => {
        console.log(`[FFmpeg] Finished processing event ${eventId}. Saved to ${this.outputPath}`);
      });

    this.command.run(); // 開始執行
  }

  write(chunk: Buffer): boolean {
    return this.passThrough.write(chunk);
  }

  end(): Promise<void> {
    return new Promise((resolve) => {
      this.passThrough.end(() => resolve());
    });
  }

  getEventDir(): string {
    return path.dirname(this.outputPath);
  }
}
