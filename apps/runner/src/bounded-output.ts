/**
 * Bounded output handling per ADR-0002.
 * combinedRetainedOutput default 16 MiB, per-frame 64 KiB, unacked batch 32 KiB.
 * This module implements the runner-side retention window with truncation metadata.
 */

export const DEFAULT_COMBINED_RETAINED_OUTPUT = 16 * 1024 * 1024;
export const FRAME_LIMIT = 64 * 1024;
export const BATCH_LIMIT = 32 * 1024;
export const UNACKED_HIGH_WATER = 256 * 1024;

export interface TruncationMeta {
  inputBytesSeen: number;
  redactedBytesProduced: number;
  bytesRetained: number;
  bytesDropped: number;
  firstDroppedRedactedOffset: number | null;
  truncated: boolean;
}

export class BoundedCollector {
  private retained: Buffer[] = [];
  private retainedBytes = 0;
  private inputBytesSeen = 0;
  private redactedBytesProduced = 0;
  private firstDroppedOffset: number | null = null;

  constructor(private readonly limit: number = DEFAULT_COMBINED_RETAINED_OUTPUT) {}

  push(inputBytes: number, redactedChunk: Buffer): void {
    this.inputBytesSeen += inputBytes;
    this.redactedBytesProduced += redactedChunk.length;

    if (redactedChunk.length === 0) return;

    const remaining = this.limit - this.retainedBytes;
    if (remaining <= 0) {
      if (this.firstDroppedOffset === null) this.firstDroppedOffset = this.retainedBytes;
      return;
    }
    if (redactedChunk.length <= remaining) {
      this.retained.push(redactedChunk);
      this.retainedBytes += redactedChunk.length;
    } else {
      this.retained.push(redactedChunk.subarray(0, remaining));
      this.retainedBytes += remaining;
      if (this.firstDroppedOffset === null) this.firstDroppedOffset = this.limit;
    }
  }

  frames(): Buffer[] {
    // Split retained bytes into 64 KiB frames preserving line terminators where possible
    // but for simplicity split at exact boundaries (ADR allows exact 64 KiB boundaries)
    const out: Buffer[] = [];
    let offset = 0;
    const concatenated = Buffer.concat(this.retained);
    while (offset < concatenated.length) {
      out.push(concatenated.subarray(offset, Math.min(offset + FRAME_LIMIT, concatenated.length)));
      offset += FRAME_LIMIT;
    }
    return out;
  }

  combined(): Buffer {
    return Buffer.concat(this.retained);
  }

  meta(): TruncationMeta {
    const bytesDropped = this.redactedBytesProduced - this.retainedBytes;
    return {
      inputBytesSeen: this.inputBytesSeen,
      redactedBytesProduced: this.redactedBytesProduced,
      bytesRetained: this.retainedBytes,
      bytesDropped: Math.max(0, bytesDropped),
      firstDroppedRedactedOffset: this.firstDroppedOffset,
      truncated: bytesDropped > 0,
    };
  }

  limitBytes(): number {
    return this.limit;
  }
}
