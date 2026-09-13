import { formatMeters } from '@/lib/domain/distance';
import { formatWeekRange } from '@/lib/domain/week';

export type NotificationView = {
  id: string; type: string; link: string | null; readAt: string | null; createdAt: string;
  meta: Record<string, string | number | null>;
};

export function notificationText(n: NotificationView): string {
  const m = n.meta ?? {};
  switch (n.type) {
    case 'join_request': return `${m.nickname ?? '회원'}님이 참여를 요청했습니다.`;
    case 'join_result': return m.status === 'approved' ? `${m.groupName} 참여가 승인되었습니다.` : m.status === 'rejected' ? `${m.groupName} 참여 요청이 거절되었습니다.` : `${m.groupName} 참여 요청이 처리되었습니다.`;
    case 'record_submitted': return `${m.nickname ?? '회원'}님이 ${m.meters ? formatMeters(Number(m.meters)) + 'km ' : ''}기록을 제출했습니다.`;
    case 'record_review': {
      const s = m.status === 'approved' ? '승인되었습니다' : m.status === 'rejected' ? `반려되었습니다${m.reason ? ` (${m.reason})` : ''}` : m.status === 'pending' ? `승인이 취소되었습니다${m.reason ? ` (${m.reason})` : ''}` : '처리되었습니다';
      return `${m.meters ? formatMeters(Number(m.meters)) + 'km ' : ''}기록이 ${s}.`;
    }
    case 'record_expired': return `${m.date ?? ''} ${m.meters ? formatMeters(Number(m.meters)) + 'km ' : ''}기록이 검토 기한 만료로 합계에서 제외되었습니다.`;
    case 'review_reminder': return m.phase === '11' ? '지난주 기록 검토 마감이 1시간 남았습니다 (12:00).' : '지난주 검토가 남아 있습니다. 월요일 12:00까지 처리하세요.';
    case 'week_final': return `${m.weekStart ? formatWeekRange(String(m.weekStart)) + ' ' : ''}주간 결과가 확정되었습니다.`;
    default: return '알림';
  }
}

export function notificationTitle(n: NotificationView): string {
  const name = n.type === 'week_final' ? n.meta?.groupName : null;
  return name ? String(name) : 'Running Log';
}
