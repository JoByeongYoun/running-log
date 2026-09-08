import { EmptyState } from '@/components/ui/States';

export async function ReviewQueue({ groupId }: { groupId: string }) {
  void groupId;
  return <EmptyState title="기록 검토는 다음 단계에서 구현됩니다" />;
}
