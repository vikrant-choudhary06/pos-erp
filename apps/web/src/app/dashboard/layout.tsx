import { SessionGate } from '@/components/shell/session-gate';
import { Sidebar } from '@/components/shell/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <div className="lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-8 lg:py-10">{children}</div>
        </main>
      </div>
    </SessionGate>
  );
}
