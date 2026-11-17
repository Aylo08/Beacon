// Minimal GTFS-Realtime decoder (TripUpdates only) for the ORIZO feed, written
// against the protobuf wire format to avoid a protobuf dependency. Only the
// fields Beacon uses are read; everything else is skipped.
//
// FeedMessage { 1: header { 3: timestamp }, 2: entity { 3: trip_update {
//   1: trip { 1: trip_id, 4: schedule_relationship (3 = CANCELED) },
//   2: stop_time_update { 4: stop_id, 2: arrival { 2: time }, 3: departure { 2: time },
//                         5: schedule_relationship (1 = SKIPPED) } } } }
import { fetch } from 'expo/fetch';
import { strFromU8 } from 'fflate';
import { t } from './i18n';

const RT_URL = 'https://api.maas-fr.cityway.fr/dataflow/horaire-tc-tr/download?provider=ORIZO&dataFormat=gtfs-rt';

export type TripRealtime = {
  canceled: boolean;
  /** stop_id → expected departure (else arrival) in ms; null when the stop is skipped. */
  stops: Map<string, number | null>;
};
export type RealtimeFeed = { timestamp: number; trips: Map<string, TripRealtime> };

class Reader {
  readonly buf: Uint8Array;
  readonly end: number;
  pos: number;
  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
  }
  get done() {
    return this.pos >= this.end;
  }
  // Arithmetic instead of bit shifts: JS bitwise ops are 32-bit and timestamps aren't.
  varint() {
    let result = 0;
    let mul = 1;
    for (;;) {
      const b = this.buf[this.pos++];
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
    }
  }
  /** Next field: [fieldNumber, wireType]. */
  tag(): [number, number] {
    const t = this.varint();
    return [Math.floor(t / 8), t % 8];
  }
  /** Sub-reader over a length-delimited field. */
  sub() {
    const len = this.varint();
    const r = new Reader(this.buf, this.pos, this.pos + len);
    this.pos += len;
    return r;
  }
  string() {
    const len = this.varint();
    const s = strFromU8(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) {
      const len = this.varint(); // read first: `pos += varint()` would use the old pos
      this.pos += len;
    }
    else if (wire === 5) this.pos += 4;
    else throw new Error(`GTFS-RT: unsupported wire type ${wire}`);
  }
}

/** Reads StopTimeEvent.time (field 2). */
function eventTime(r: Reader): number | undefined {
  let time: number | undefined;
  while (!r.done) {
    const [f, w] = r.tag();
    if (f === 2 && w === 0) time = r.varint();
    else r.skip(w);
  }
  return time;
}

function tripUpdate(r: Reader, trips: Map<string, TripRealtime>) {
  let tripId = '';
  let canceled = false;
  const stops = new Map<string, number | null>();
  while (!r.done) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) {
      const t = r.sub();
      while (!t.done) {
        const [tf, tw] = t.tag();
        if (tf === 1 && tw === 2) tripId = t.string();
        else if (tf === 4 && tw === 0) canceled = t.varint() === 3;
        else t.skip(tw);
      }
    } else if (f === 2 && w === 2) {
      const s = r.sub();
      let stopId = '';
      let arrival: number | undefined;
      let departure: number | undefined;
      let skipped = false;
      while (!s.done) {
        const [sf, sw] = s.tag();
        if (sf === 4 && sw === 2) stopId = s.string();
        else if (sf === 2 && sw === 2) arrival = eventTime(s.sub());
        else if (sf === 3 && sw === 2) departure = eventTime(s.sub());
        else if (sf === 5 && sw === 0) skipped = s.varint() === 1;
        else s.skip(sw);
      }
      const time = departure ?? arrival;
      if (stopId) stops.set(stopId, skipped ? null : time != null ? time * 1000 : null);
    } else r.skip(w);
  }
  if (tripId) trips.set(tripId, { canceled, stops });
}

export function decodeFeed(buf: Uint8Array): RealtimeFeed {
  const r = new Reader(buf);
  const trips = new Map<string, TripRealtime>();
  let timestamp = 0;
  while (!r.done) {
    const [f, w] = r.tag();
    if (f === 1 && w === 2) {
      const h = r.sub();
      while (!h.done) {
        const [hf, hw] = h.tag();
        if (hf === 3 && hw === 0) timestamp = h.varint() * 1000;
        else h.skip(hw);
      }
    } else if (f === 2 && w === 2) {
      const e = r.sub();
      while (!e.done) {
        const [ef, ew] = e.tag();
        if (ef === 3 && ew === 2) tripUpdate(e.sub(), trips);
        else e.skip(ew);
      }
    } else r.skip(w);
  }
  return { timestamp, trips };
}

export async function fetchRealtime(): Promise<RealtimeFeed> {
  const res = await fetch(RT_URL);
  if (!res.ok) throw new Error(t('err.realtimeHttp', { status: res.status }));
  return decodeFeed(await res.bytes());
}
