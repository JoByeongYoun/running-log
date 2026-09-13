import { describe, it, expect } from 'vitest';
import { notificationText, notificationTitle, type NotificationView } from '@/lib/notification-text';

function view(type: string, meta: NotificationView['meta'] = {}): NotificationView {
  return { id: 'n1', type, link: null, readAt: null, createdAt: '2026-09-09T00:00:00Z', meta };
}

describe('notificationText', () => {
  it('renders every notification type', () => {
    expect(notificationText(view('join_request', { nickname: '민수' }))).toBe('민수님이 참여를 요청했습니다.');
    expect(notificationText(view('join_result', { status: 'approved', groupName: '새벽런' }))).toBe('새벽런 참여가 승인되었습니다.');
    expect(notificationText(view('join_result', { status: 'rejected', groupName: '새벽런' }))).toBe('새벽런 참여 요청이 거절되었습니다.');
    expect(notificationText(view('record_submitted', { nickname: '민수', meters: 5000 }))).toBe('민수님이 5.00km 기록을 제출했습니다.');
    expect(notificationText(view('record_review', { status: 'approved', meters: 5000 }))).toBe('5.00km 기록이 승인되었습니다.');
    expect(notificationText(view('record_review', { status: 'rejected', reason: '흐림', meters: 5000 }))).toBe('5.00km 기록이 반려되었습니다 (흐림).');
    expect(notificationText(view('record_expired', { date: '2026-09-01', meters: 5000 }))).toBe('2026-09-01 5.00km 기록이 검토 기한 만료로 합계에서 제외되었습니다.');
    expect(notificationText(view('review_reminder', { phase: '11' }))).toBe('지난주 기록 검토 마감이 1시간 남았습니다 (12:00).');
    expect(notificationText(view('review_reminder', { phase: '00' }))).toBe('지난주 검토가 남아 있습니다. 화요일 12:00까지 처리하세요.');
    expect(notificationText(view('week_final', { weekStart: '2026-08-31' }))).toMatch(/주간 결과가 확정되었습니다\.$/);
    expect(notificationText(view('unknown'))).toBe('알림');
  });
});

describe('notificationTitle', () => {
  it('uses group name for week_final and app name otherwise', () => {
    expect(notificationTitle(view('week_final', { groupName: '새벽런' }))).toBe('새벽런');
    expect(notificationTitle(view('week_final'))).toBe('Running Log');
    expect(notificationTitle(view('record_review'))).toBe('Running Log');
  });
});
