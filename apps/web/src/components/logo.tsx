import Link from 'next/link';
import { cn } from '@/lib/cn';

export const APP_NAME = 'Rizzoto';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden>
      <rect width="24" height="24" rx="7" className="fill-ink" />
      {/* a lowercase "r." */}
      <path
        d="M9 17v-5.5A3.5 3.5 0 0 1 12.5 8H14"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16.2" r="1.3" fill="white" />
    </svg>
  );
}

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}
