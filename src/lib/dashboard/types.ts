export type RecordStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type WeekState = 'open' | 'closing' | 'finalized';
export type Outcome = 'success' | 'fail' | 'not_evaluated' | 'provisional_success' | 'provisional_fail' | 'pending_review';

export type DayCell = {
  date: string;
  approvedMeters: number;
  pendingMeters: number;
  records: { id: string; status: RecordStatus; meters: number }[];
};

export type MemberRow = {
  userId: string;
  nickname: string;
  avatarPath: string | null;
  avatarUrl?: string | null;
  eligible: boolean;
  joinedThisWeek: boolean;
  leftDuringWeek: boolean;
  activeNow: boolean;
  approvedMeters: number;
  pendingMeters: number;
  rank: number | null;
  outcome: Outcome;
  days: DayCell[];
};

export type WeekDashboard = {
  week: {
    id: string; weekStart: string; state: WeekState; targetMeters: number; penalty: string;
    finalizedAt: string | null; groupName: string; groupTotalMeters: number | null; isCurrent: boolean;
  };
  me: { approvedMeters: number; pendingMeters: number; eligible: boolean; inWeek: boolean };
  members: MemberRow[];
  pendingCount: number;
  provisional: boolean;
  today: string;
};

export type WeekSummary = WeekDashboard & {
  successCount: number;
  evaluatedCount: number;
  groupTotalMeters: number;
  myUserId: string;
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  success: '성공', fail: '실패', not_evaluated: '준비 주간',
  provisional_success: '성공 예정', provisional_fail: '실패 예정', pending_review: '판정 대기',
};

export const STATUS_LABEL: Record<RecordStatus, string> = {
  pending: '승인 대기', approved: '승인됨', rejected: '반려됨', expired: '기한 만료',
};
