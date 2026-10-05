import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';
import { evaluate } from '@/lib/domain/penalty';
import type { RunnerType } from '@/lib/domain/runner-type';

const S = { targetMeters: 15000, freeMinMeters: 5000, penaltyPerKmWon: 10000, zeroKmPenaltyWon: 100000 };

async function newMember(label: string): Promise<TestUser> {
  const u = await createTestUser(label);
  await completeProfile(u, label);
  return u;
}

describe('app.evaluate matches the TS evaluate()', () => {
  const admin = adminClient();
  beforeAll(async () => { await resetAll(); });

  it('agrees on a table of inputs', async () => {
    const cases: Array<[RunnerType, number]> = [
      ['passion', 0], ['passion', 1], ['passion', 12300], ['passion', 14000], ['passion', 14999], ['passion', 15000], ['passion', 30000],
      ['free', 0], ['free', 2500], ['free', 4999], ['free', 5000], ['free', 15000],
      ['injured', 0], ['injured', 15000],
    ];
    for (const [type, total] of cases) {
      const { data, error } = await admin.rpc('test_evaluate', {
        p_type: type, p_total: total, p_target: S.targetMeters, p_free_min: S.freeMinMeters, p_per_km: S.penaltyPerKmWon, p_zero_won: S.zeroKmPenaltyWon,
      });
      expect(error, `${type}/${total}`).toBeNull();
      const row = (data as Array<{ outcome: string; penalty_won: number; ranked: boolean }>)[0];
      const ts = evaluate(type, total, S);
      expect({ outcome: row.outcome, penaltyWon: row.penalty_won, ranked: row.ranked }, `${type}/${total}`)
        .toEqual({ outcome: ts.outcome, penaltyWon: ts.penaltyWon, ranked: ts.ranked });
    }
  });
});

// Task 3 에서 아래에 설정·스냅샷·마감 시나리오가 추가된다.
void uploadEvidence; void submit; void setFakeNow; void expectRpcError; void newMember;
