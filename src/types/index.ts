export enum PacketOpCode {
  START = 'STRT', // 開始傳輸影片
  DATA = 'DATA',  // 影片片段
  END = 'END_',   // 結束傳輸
  JSON = 'JSON'   // 元資料 (Metadata)
}

export interface ParsedPacket {
  opCode: PacketOpCode | string;
  payloadSize: number;
  payload: Buffer;
}

export interface StreamConfig {
  type: 'ffmpeg' | 'file';
  outputDir: string;
  ffmpegOptions?: string[]; // 提供給 ffmpeg-stream 的額外選項
}
