import Link from 'next/link';
import { BrandMark } from './BrandMark';

type Props = { title: string; back?: string; brand?: boolean; right?: React.ReactNode };

export function AppHeader({ title, back, brand, right }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-md items-center gap-2 px-3">
        {back && (
          <Link href={back} aria-label="뒤로" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl hover:bg-slate-100">‹</Link>
        )}
        {brand && <BrandMark size="sm" className="ml-1" />}
        <h1 className="flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
        {right}
      </div>
    </header>
  );
}
