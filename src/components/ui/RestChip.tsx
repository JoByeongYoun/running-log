/** "휴식 중" 라벨. 평가 제외 상태를 목록·모달에서 한눈에 구분하는 용도. */
export function RestChip({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 ${className}`}>
      <span aria-hidden>💤</span> 휴식 중
    </span>
  );
}
