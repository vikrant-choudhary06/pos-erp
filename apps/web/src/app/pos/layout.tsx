import type { Metadata } from 'next';
import { SessionGate } from '@/components/shell/session-gate';

export const metadata: Metadata = { title: 'POS' };

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <SessionGate signInPath="/lock">{children}</SessionGate>;
}
