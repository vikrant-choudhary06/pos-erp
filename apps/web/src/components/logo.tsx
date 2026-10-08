import Link from 'next/link';
import { cn } from '@/lib/cn';

export const APP_NAME = 'Counter';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden>
      <rect width="24" height="24" rx="7" className="fill-ink" />
      <path d="M7 8.5h10M7 12h10M7 15.5h6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
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
