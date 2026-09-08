export function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initial = name.trim().slice(0, 1) || '?';
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${name} 프로필`} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div aria-label={`${name} 프로필`} className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600" style={{ width: size, height: size }}>{initial}</div>
  );
}
