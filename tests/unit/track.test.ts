import { describe, it, expect } from 'vitest';
import { buildTrack } from '@/lib/dashboard/track';
import type { DayCell } from '@/lib/dashboard/types';

const day = (date: string, records: DayCell['records']): DayCell => ({
  date,
  approvedMeters: records.filter((r) => r.status === 'approved').reduce((s, r) => s + r.meters, 0),
  pendingMeters: records.filter((r) => r.status === 'pending').reduce((s, r) => s + r.meters, 0),
  records,
});

describe('buildTrack', () => {
  it('lays approved segments first (date order), then pending, as % of target', () => {
    const track = buildTrack([{ userId: 'a', days: [
      day('2026-09-07', [{ id: 'r1', status: 'approved', meters: 5000 }]),
      day('2026-09-08', [{ id: 'r2', status: 'pending', meters: 2000 }]),
      day('2026-09-09', [{ id: 'r3', status: 'approved', meters: 3000 }]),
    ] }], 20000);
    expect(track.scaleMeters).toBe(20000);
    expect(track.goalPct).toBe(100);
    const lane = track.lanes.get('a')!;
    expect(lane.segments.map((s) => [s.id, s.status, s.date, s.startPct, s.widthPct])).toEqual([
      ['r1', 'approved', '2026-09-07', 0, 25],
      ['r3', 'approved', '2026-09-09', 25, 15],
      ['r2', 'pending', '2026-09-08', 40, 10],
    ]);
    expect(lane.approvedPct).toBe(40);
    expect(lane.endPct).toBe(50);
    expect(lane.overMeters).toBe(0);
  });

  it('drops rejected and expired records from the track', () => {
    const track = buildTrack([{ userId: 'a', days: [
      day('2026-09-07', [{ id: 'r1', status: 'rejected', meters: 5000 }, { id: 'r2', status: 'expired', meters: 1000 }]),
    ] }], 20000);
    expect(track.lanes.get('a')!.segments).toEqual([]);
    expect(track.lanes.get('a')!.approvedPct).toBe(0);
  });

  it('stretches the scale when someone runs past the goal so every record stays on the track', () => {
    const track = buildTrack([
      { userId: 'a', days: [day('2026-09-07', [{ id: 'r1', status: 'approved', meters: 25000 }])] },
      { userId: 'b', days: [day('2026-09-07', [{ id: 'r2', status: 'approved', meters: 10000 }])] },
    ], 20000);
    expect(track.scaleMeters).toBe(25000);
    expect(track.goalPct).toBe(80);
    expect(track.lanes.get('a')!.approvedPct).toBe(100);
    expect(track.lanes.get('a')!.overMeters).toBe(5000);
    expect(track.lanes.get('b')!.approvedPct).toBe(40);
  });

  it('counts pending distance toward the scale but not toward overMeters', () => {
    const track = buildTrack([
      { userId: 'a', days: [day('2026-09-07', [{ id: 'r1', status: 'approved', meters: 18000 }, { id: 'r2', status: 'pending', meters: 6000 }])] },
    ], 20000);
    expect(track.scaleMeters).toBe(24000);
    expect(track.lanes.get('a')!.overMeters).toBe(0);
    expect(track.lanes.get('a')!.endPct).toBe(100);
  });

  it('survives a zero target', () => {
    const track = buildTrack([{ userId: 'a', days: [day('2026-09-07', [{ id: 'r1', status: 'approved', meters: 1000 }])] }], 0);
    expect(track.scaleMeters).toBe(1000);
    expect(track.goalPct).toBe(0);
    expect(track.lanes.get('a')!.approvedPct).toBe(100);
  });

  it('handles an empty member list', () => {
    const track = buildTrack([], 20000);
    expect(track.lanes.size).toBe(0);
    expect(track.goalPct).toBe(100);
  });
});
