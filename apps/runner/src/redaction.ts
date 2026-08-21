/**
 * Streaming redactor per ADR-0002.
 * - Exact configured secrets: leftmost-longest byte matching, each capped at 64 KiB.
 * - Common prefixes: --password=, --token=, --api-key=, Authorization: – all case-insensitive
 *   redact whole unquoted value until ASCII space/tab/CR/LF/NUL or EOF, or quoted contents.
 * - Bounded lookbehind: never retain more than max secret / prefix+64 KiB.
 * - Byte-exact for nonmatching bytes, including invalid UTF-8.
 * - Oversize (>64 KiB) value: emit one [REDACTED], discard entire value until delimiter/quote/EOF,
 *   preserve delimiters/quotes, record oversize once, keep memory bounded.
 */

export interface Redactor {
  push(chunk: Buffer): Buffer;
  flush(): Buffer;
  bufferedBytes(): number;
  oversizeCount(): number;
}

const CREDENTIAL_PREFIXES: ReadonlyArray<{ raw: string; lower: string; buf: Buffer; lowerBuf: Buffer }> = (() => {
  const raws = ["--password=", "--token=", "--api-key=", "Authorization: "];
  return raws.map((raw) => ({
    raw,
    lower: raw.toLowerCase(),
    buf: Buffer.from(raw, "utf8"),
    lowerBuf: Buffer.from(raw.toLowerCase(), "utf8"),
  }));
})();

const MAX_EXACT_SECRET_BYTES = 64 * 1024;
const MAX_CREDENTIAL_VALUE_BYTES = 64 * 1024;

function isAsciiDelimiter(b: number): boolean {
  return b === 0x20 || b === 0x09 || b === 0x0d || b === 0x0a || b === 0x00;
}

function bufferStartsWithCaseInsensitive(buffer: Buffer, lowerPrefix: Buffer): boolean {
  if (buffer.length < lowerPrefix.length) return false;
  for (let i = 0; i < lowerPrefix.length; i++) {
    const a = buffer[i] as number;
    const b = lowerPrefix[i] as number;
    const la = a >= 0x41 && a <= 0x5a ? a + 0x20 : a;
    if (la !== b) return false;
  }
  return true;
}

function findLongestSecretAtStart(buffer: Buffer, secrets: readonly Buffer[]): Buffer | null {
  let longest: Buffer | null = null;
  for (const s of secrets) {
    if (buffer.length >= s.length && buffer.subarray(0, s.length).equals(s)) {
      if (longest === null || s.length > longest.length) longest = s;
    }
  }
  return longest;
}

function isPrefixOfAnySecret(buffer: Buffer, secrets: readonly Buffer[]): boolean {
  for (const s of secrets) {
    if (s.length > buffer.length && s.subarray(0, buffer.length).equals(buffer)) return true;
  }
  return false;
}

function isPrefixOfAnyCredentialPrefix(buffer: Buffer): boolean {
  for (const p of CREDENTIAL_PREFIXES) {
    const needed = Math.min(buffer.length, p.buf.length);
    let ok = true;
    for (let i = 0; i < needed; i++) {
      const a = buffer[i] as number;
      const bLower = p.lowerBuf[i] as number;
      const aLower = a >= 0x41 && a <= 0x5a ? a + 0x20 : a;
      if (aLower !== bLower) {
        ok = false;
        break;
      }
    }
    if (ok && p.buf.length > buffer.length) return true;
  }
  return false;
}

function findCredentialPrefixAtStart(buffer: Buffer): { len: number } | null {
  for (const p of CREDENTIAL_PREFIXES) {
    if (bufferStartsWithCaseInsensitive(buffer, p.lowerBuf)) return { len: p.buf.length };
  }
  return null;
}

export function createRedactor(options: {
  secrets?: readonly string[];
  extraTokens?: readonly string[];
}): Redactor {
  const secretStrs = [...(options.secrets ?? []), ...(options.extraTokens ?? [])].filter(
    (s) => s.length > 0 && Buffer.byteLength(s, "utf8") <= MAX_EXACT_SECRET_BYTES,
  );
  secretStrs.sort((a, b) => Buffer.byteLength(b, "utf8") - Buffer.byteLength(a, "utf8"));
  const secretBufs = secretStrs.map((s) => Buffer.from(s, "utf8"));

  let stash = Buffer.alloc(0);
  let discarding: { kind: "unquoted" } | { kind: "quoted"; quote: number } | null = null;
  let oversizeCount = 0;

  function processChunk(isFinal: boolean): Buffer {
    const outParts: Buffer[] = [];
    let pos = 0;

    // If we are in discarding mode (oversize value), consume until delimiter/quote
    if (discarding !== null) {
      if (discarding.kind === "unquoted") {
        let delimPos = -1;
        for (let i = 0; i < stash.length; i++) {
          if (isAsciiDelimiter(stash[i] as number)) {
            delimPos = i;
            break;
          }
        }
        if (delimPos !== -1) {
          // Emit delimiter byte-exact, discard value bytes before it
          outParts.push(stash.subarray(delimPos, delimPos + 1));
          pos = delimPos + 1;
          discarding = null;
        } else {
          // No delimiter yet
          if (isFinal) {
            // EOF: discard rest
            pos = stash.length;
            discarding = null;
          } else {
            // Discard all buffered value bytes, keep waiting for delimiter
            // Do not emit anything, keep stash empty for next push
            // But need to avoid unbounded buffering: we discard stash now
            pos = stash.length;
            // Stay in discarding mode for next push
            // Return what we have (maybe delimiter if found, else nothing)
            const emitted = Buffer.concat(outParts);
            stash = stash.subarray(pos);
            return emitted;
          }
        }
        // Continue to normal processing for remaining bytes after delimiter
        // Fall through to while loop with pos updated
      } else {
        // quoted discarding
        const quote = discarding.quote;
        let closing = -1;
        for (let i = 0; i < stash.length; i++) {
          if ((stash[i] as number) === quote) {
            closing = i;
            break;
          }
        }
        if (closing !== -1) {
          outParts.push(stash.subarray(closing, closing + 1)); // closing quote
          pos = closing + 1;
          discarding = null;
        } else {
          if (isFinal) {
            // EOF without closing quote: per spec missing closing remains missing, discard rest
            pos = stash.length;
            discarding = null;
          } else {
            // Still waiting for closing quote, discard buffered value bytes
            pos = stash.length;
            const emitted = Buffer.concat(outParts);
            stash = stash.subarray(pos);
            return emitted;
          }
        }
      }
      // If we were discarding and now found delimiter/quote, we have emitted it and pos advanced
      // Continue to normal loop for remaining
    }

    while (pos < stash.length) {
      const remaining = stash.subarray(pos);

      // 1) Credential prefix at current position? (case-insensitive for all)
      const cred = findCredentialPrefixAtStart(remaining);
      if (cred !== null) {
        const prefixLen = cred.len;
        const valueStart = prefixLen;
        if (remaining.length <= valueStart) {
          if (!isFinal) break;
          outParts.push(remaining.subarray(0, prefixLen));
          outParts.push(Buffer.from("[REDACTED]", "utf8"));
          pos += remaining.length;
          break;
        }
        const firstValByte = remaining[valueStart] as number;
        if (firstValByte === 0x22 || firstValByte === 0x27) {
          const quote = firstValByte;
          let closing = -1;
          const searchLimit = Math.min(remaining.length, valueStart + 1 + MAX_CREDENTIAL_VALUE_BYTES + 1);
          for (let i = valueStart + 1; i < searchLimit; i++) {
            if ((remaining[i] as number) === quote) {
              closing = i;
              break;
            }
          }
          if (closing !== -1) {
            outParts.push(remaining.subarray(0, valueStart + 1));
            outParts.push(Buffer.from("[REDACTED]", "utf8"));
            outParts.push(remaining.subarray(closing, closing + 1));
            pos += closing + 1;
            continue;
          }
          if (!isFinal && remaining.length < valueStart + 1 + MAX_CREDENTIAL_VALUE_BYTES + 1) {
            // Need more data to know if closing quote arrives, and still within limit
            // Check if we have at least some data but not enough to exceed limit
            // If remaining is shorter than limit, wait
            break;
          }
          // EOF or oversize: check if value exceeds limit
          const valueBytesAvailable = remaining.length - (valueStart + 1);
          if (valueBytesAvailable >= MAX_CREDENTIAL_VALUE_BYTES && !isFinal) {
            // Oversize without closing quote within 64 KiB -> discard entire quoted value until closing quote
            outParts.push(remaining.subarray(0, valueStart + 1));
            outParts.push(Buffer.from("[REDACTED]", "utf8"));
            if (oversizeCount === 0) oversizeCount = 1;
            // Discard up to 64 KiB already, enter discarding for rest until closing quote
            pos += valueStart + 1 + MAX_CREDENTIAL_VALUE_BYTES;
            discarding = { kind: "quoted", quote };
            // Discard any remaining buffered bytes that are part of oversize value (up to stash end)
            // But we already consumed 64 KiB, the rest of remaining beyond that is still in stash
            // We will continue loop which will enter discarding mode at top of next iteration?
            // Instead, set discarding and break to handle next push
            // For current stash, discard the rest of the value bytes already in buffer beyond 64 KiB
            // Find if closing quote is beyond 64 KiB in current stash – we already searched up to limit, not found,
            // so the rest of stash beyond limit is still value bytes to discard.
            // We have consumed prefix+quote+64 KiB, the remaining bytes in this stash (if any) are still value
            // We should discard them now if they are not closing quote.
            // Since we are in discarding mode, we will discard on next iteration or next push.
            // For now, keep discarding flag and break to avoid emitting those bytes.
            // We need to keep the remaining stash bytes (beyond consumed) for discarding.
            // So we should not advance pos to end, just to consumed, and keep discarding.
            // The remaining bytes (stash.length - pos) are still value bytes to discard.
            // We will handle them via discarding logic on next loop iteration (or next push).
            // To avoid emitting them as normal, we keep them in stash and enter discarding.
            // So break to preserve them for discarding.
            break;
          }
          // EOF without closing quote within limit
          outParts.push(remaining.subarray(0, valueStart + 1));
          outParts.push(Buffer.from("[REDACTED]", "utf8"));
          pos += remaining.length;
          break;
        } else {
          let delimPos = -1;
          const searchLimit = Math.min(remaining.length, valueStart + MAX_CREDENTIAL_VALUE_BYTES + 1);
          for (let i = valueStart; i < searchLimit; i++) {
            if (isAsciiDelimiter(remaining[i] as number)) {
              delimPos = i;
              break;
            }
          }
          if (delimPos !== -1) {
            outParts.push(remaining.subarray(0, valueStart));
            outParts.push(Buffer.from("[REDACTED]", "utf8"));
            outParts.push(remaining.subarray(delimPos, delimPos + 1));
            pos += delimPos + 1;
            continue;
          }
          if (!isFinal && remaining.length < valueStart + MAX_CREDENTIAL_VALUE_BYTES + 1) {
            break;
          }
          const valueLen = remaining.length - valueStart;
          if (valueLen > MAX_CREDENTIAL_VALUE_BYTES) {
            outParts.push(remaining.subarray(0, valueStart));
            outParts.push(Buffer.from("[REDACTED]", "utf8"));
            if (oversizeCount === 0) oversizeCount = 1;
            pos += valueStart + MAX_CREDENTIAL_VALUE_BYTES;
            discarding = { kind: "unquoted" };
            break;
          }
          if (isFinal) {
            outParts.push(remaining.subarray(0, valueStart));
            outParts.push(Buffer.from("[REDACTED]", "utf8"));
            pos += remaining.length;
            break;
          }
          break;
        }
      }

      const longest = findLongestSecretAtStart(remaining, secretBufs);
      if (longest !== null) {
        outParts.push(Buffer.from("[REDACTED]", "utf8"));
        pos += longest.length;
        continue;
      }

      if (!isFinal) {
        if (isPrefixOfAnySecret(remaining, secretBufs) || isPrefixOfAnyCredentialPrefix(remaining)) {
          break;
        }
      }

      outParts.push(remaining.subarray(0, 1));
      pos += 1;
    }

    const emitted = Buffer.concat(outParts);
    const consumed = pos;
    stash = stash.subarray(consumed);
    return emitted;
  }

  return {
    push(chunk: Buffer): Buffer {
      if (chunk.length === 0) return Buffer.alloc(0);
      stash = Buffer.concat([stash, chunk]);
      // If we are in discarding mode, processChunk will handle discarding at top
      // Ensure bounded: if stash grows beyond 66 KiB and we are not discarding, we will emit
      // Our loop already emits when possible, so stash stays bounded to ~MAX+chunk
      return processChunk(false);
    },
    flush(): Buffer {
      // Process remaining with isFinal=true, including discarding
      // For discarding mode, flush should discard to EOF
      let out = processChunk(true);
      // If still discarding after final, discard rest
      if (discarding !== null) {
        // Discarding until EOF already handled in processChunk(true) which discards
        discarding = null;
      }
      // In case any leftover bytes remain (should be none), emit them via processChunk
      // But processChunk(true) already consumed all, so stash should be empty
      const remaining = stash;
      stash = Buffer.alloc(0);
      if (remaining.length > 0) {
        // Fallback: emit remaining as is (should not happen)
        return Buffer.concat([out, remaining]);
      }
      return out;
    },
    bufferedBytes(): number {
      return stash.length;
    },
    oversizeCount(): number {
      return oversizeCount;
    },
  };
}
