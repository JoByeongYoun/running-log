import Image from 'next/image';

const sizes = { sm: 32, md: 44, lg: 80 } as const;

export function BrandMark({ size = 'md', className = '' }: { size?: keyof typeof sizes; className?: string }) {
  const px = sizes[size];
  return (
    <Image
      src="/icons/icon-192.png"
      alt=""
      aria-hidden
      width={px}
      height={px}
      priority
      className={`shrink-0 rounded-[22%] shadow-sm ring-1 ring-black/5 ${className}`}
    />
  );
}
