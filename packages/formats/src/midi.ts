// Standard MIDI File reader.
//
// xLights' Piano effect lists a MIDI file as one of its notes sources, alongside an Audacity label
// file and its own polyphonic transcription. The effect itself is driven by a *timing track* here
// - the manual calls that "the preferred option" - so what was actually missing was a way to get
// the notes of a `.mid` onto one. That is what this reads.
//
// Only the parts a note track needs: the header's division, each track's note-on/note-off pairs,
// the tempo changes that turn ticks into milliseconds, and the track names. Controllers, pitch
// bend, sysex and the rest are skipped over rather than parsed - a file full of them still yields
// its notes.

export interface MidiNote {
  /** MIDI note number, 0-127. */
  midi: number;
  startMs: number;
  endMs: number;
  /** 1-127. A note-on with velocity 0 is a note-off and never appears here. */
  velocity: number;
}

export interface MidiTrack {
  /** The FF 03 track name, or "" when the file didn't give one. */
  name: string;
  notes: MidiNote[];
}

export interface ParsedMidi {
  tracks: MidiTrack[];
  /** Where the last note ends - what a timing track built from this file has to span. */
  durationMs: number;
}

class Reader {
  private at = 0;
  private readonly bytes: Uint8Array;

  // Written out rather than as a parameter property: the web app builds with `erasableSyntaxOnly`,
  // which rules out the TypeScript-only shorthand.
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get offset(): number {
    return this.at;
  }
  get done(): boolean {
    return this.at >= this.bytes.length;
  }
  byte(): number {
    if (this.at >= this.bytes.length) throw new Error("Unexpected end of MIDI file");
    return this.bytes[this.at++]!;
  }
  peek(): number {
    return this.bytes[this.at] ?? 0;
  }
  uint16(): number {
    return (this.byte() << 8) | this.byte();
  }
  uint32(): number {
    return ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0;
  }
  skip(n: number): void {
    this.at += n;
  }
  slice(n: number): Uint8Array {
    const out = this.bytes.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  ascii(n: number): string {
    return String.fromCharCode(...this.slice(n));
  }
  /** MIDI's variable-length quantity: seven bits per byte, high bit means "another follows". */
  varInt(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.byte();
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return value;
  }
}

interface RawEvent {
  tick: number;
  type: "on" | "off" | "tempo" | "name";
  midi?: number;
  velocity?: number;
  usPerQuarter?: number;
  text?: string;
}

function readTrackEvents(reader: Reader, length: number): RawEvent[] {
  const end = reader.offset + length;
  const events: RawEvent[] = [];
  let tick = 0;
  let runningStatus = 0;

  while (reader.offset < end && !reader.done) {
    tick += reader.varInt();
    let status = reader.peek();
    if (status & 0x80) {
      reader.byte();
      // System-common status bytes cancel running status; channel ones become it.
      runningStatus = status < 0xf0 ? status : 0;
    } else {
      // Running status: the previous channel status is implied and the data bytes follow bare.
      if (!runningStatus) break; // no status to run from - the track is malformed past here
      status = runningStatus;
    }

    const command = status & 0xf0;
    if (command === 0x90 || command === 0x80) {
      const midi = reader.byte();
      const velocity = reader.byte();
      // "Note on with velocity 0" is the usual way to end a note, and treating it as a start
      // would leave every note in such a file open forever.
      events.push(command === 0x90 && velocity > 0 ? { tick, type: "on", midi, velocity } : { tick, type: "off", midi });
    } else if (command === 0xa0 || command === 0xb0 || command === 0xe0) {
      reader.skip(2); // aftertouch, controller, pitch bend
    } else if (command === 0xc0 || command === 0xd0) {
      reader.skip(1); // program change, channel pressure
    } else if (status === 0xff) {
      const meta = reader.byte();
      const len = reader.varInt();
      if (meta === 0x51 && len === 3) {
        const a = reader.byte();
        const b = reader.byte();
        const c = reader.byte();
        events.push({ tick, type: "tempo", usPerQuarter: (a << 16) | (b << 8) | c });
      } else if (meta === 0x03) {
        events.push({ tick, type: "name", text: String.fromCharCode(...reader.slice(len)) });
      } else {
        reader.skip(len); // end-of-track, key signature, lyrics, markers - not needed here
      }
    } else if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.varInt());
    } else {
      break; // something this reader doesn't know: stop rather than desynchronise
    }
  }

  return events;
}

/**
 * Ticks to milliseconds.
 *
 * Two divisions exist. Metrical (the common one) counts ticks per quarter note, so a tick's length
 * depends on the tempo *in force at that point* - which is why the tempo changes are collected
 * across the whole file first and walked in order. SMPTE division is already absolute time, so its
 * ticks convert with no tempo at all.
 */
function tickToMsConverter(division: number, tempoChanges: { tick: number; usPerQuarter: number }[]): (tick: number) => number {
  if (division & 0x8000) {
    // SMPTE: high byte is a negative frames-per-second, low byte is ticks per frame.
    const framesPerSecond = 256 - ((division >> 8) & 0xff);
    const ticksPerFrame = division & 0xff;
    const perTick = 1000 / (framesPerSecond * ticksPerFrame || 1);
    return (tick) => tick * perTick;
  }

  const ticksPerQuarter = division || 480;
  const changes = [...tempoChanges].sort((a, b) => a.tick - b.tick);
  // 120 bpm until the file says otherwise, which is the MIDI default.
  if (changes.length === 0 || changes[0]!.tick > 0) changes.unshift({ tick: 0, usPerQuarter: 500000 });

  // Each change carries the elapsed time up to it, so a lookup is one walk rather than a re-sum.
  const marks = changes.map((c) => ({ ...c, ms: 0 }));
  for (let i = 1; i < marks.length; i++) {
    const prev = marks[i - 1]!;
    marks[i]!.ms = prev.ms + ((marks[i]!.tick - prev.tick) * prev.usPerQuarter) / ticksPerQuarter / 1000;
  }

  return (tick) => {
    let mark = marks[0]!;
    for (const candidate of marks) {
      if (candidate.tick > tick) break;
      mark = candidate;
    }
    return mark.ms + ((tick - mark.tick) * mark.usPerQuarter) / ticksPerQuarter / 1000;
  };
}

/**
 * Reads a Standard MIDI File.
 *
 * Formats 0, 1 and 2 all parse: the difference between them is how the tracks relate to each
 * other, and a note track cares about the notes rather than the relationship. Tempo changes are
 * pooled across every track because in format 1 they live in the first track alone and apply to
 * all of them.
 */
export function parseMidi(bytes: Uint8Array): ParsedMidi {
  const reader = new Reader(bytes);
  if (reader.ascii(4) !== "MThd") throw new Error("Not a MIDI file: missing MThd header");
  const headerLength = reader.uint32();
  reader.uint16(); // format - the tracks are read the same way whichever it is
  reader.uint16(); // track count - trusted from the chunks themselves, not from this
  const division = reader.uint16();
  reader.skip(Math.max(0, headerLength - 6));

  const rawTracks: RawEvent[][] = [];
  while (!reader.done) {
    let type: string;
    try {
      type = reader.ascii(4);
    } catch {
      break; // trailing bytes after the last chunk
    }
    if (type.length < 4) break;
    const length = reader.uint32();
    if (type !== "MTrk") {
      reader.skip(length); // an alien chunk: the spec says skip it
      continue;
    }
    rawTracks.push(readTrackEvents(reader, length));
  }

  const tempoChanges = rawTracks
    .flat()
    .filter((e) => e.type === "tempo")
    .map((e) => ({ tick: e.tick, usPerQuarter: e.usPerQuarter! }));
  const toMs = tickToMsConverter(division, tempoChanges);

  let durationMs = 0;
  const tracks: MidiTrack[] = rawTracks.map((events) => {
    const notes: MidiNote[] = [];
    // Several notes of the same pitch can overlap on different channels; a stack per pitch pairs
    // each note-off with the most recent matching note-on rather than closing all of them.
    const open = new Map<number, { tick: number; velocity: number }[]>();

    for (const event of events) {
      if (event.type === "on") {
        const stack = open.get(event.midi!) ?? [];
        stack.push({ tick: event.tick, velocity: event.velocity! });
        open.set(event.midi!, stack);
      } else if (event.type === "off") {
        const started = open.get(event.midi!)?.pop();
        if (!started) continue; // a note-off with no note-on: nothing to close
        notes.push({
          midi: event.midi!,
          startMs: Math.round(toMs(started.tick)),
          endMs: Math.round(toMs(event.tick)),
          velocity: started.velocity,
        });
      }
    }

    notes.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
    for (const note of notes) durationMs = Math.max(durationMs, note.endMs);

    const named = events.find((e) => e.type === "name");
    return { name: (named?.text ?? "").trim(), notes };
  });

  return { tracks, durationMs };
}
