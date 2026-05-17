import fs from 'fs';
import path from 'path';

export class FileStreamer {
    private writeStream: fs.WriteStream;
    private outputPath: string;

    constructor(eventId: string, outputDir: string) {
        const eventDir = path.join(process.cwd(), outputDir, eventId);
        if (!fs.existsSync(eventDir)) {
            fs.mkdirSync(eventDir, { recursive: true });
        }

        this.outputPath = path.join(eventDir, 'raw_data.bin');
        this.writeStream = fs.createWriteStream(this.outputPath);

        this.writeStream.on('error', (err) => {
             console.error(`[FileStreamer] Error writing to ${this.outputPath}:`, err.message);
        });
    }

    write(chunk: Buffer): boolean {
        return this.writeStream.write(chunk);
    }

    end(): void {
        this.writeStream.end(() => {
            console.log(`[FileStreamer] Finished writing raw data to ${this.outputPath}`);
        });
    }
}