'use client';

import { useQuery } from '@tanstack/react-query';
import * as m from 'motion/react-m';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Skeleton } from '@/components/ui/misc';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Role, Staff } from '@/lib/types';
import { RoleSheet } from './role-sheet';
import { StaffSheet } from './staff-sheet';

type View = 'staff' | 'roles';

export default function StaffPage() {
  const [view, setView] = useState<View>('staff');
  const [editingStaff, setEditingStaff] = useState<Staff | 'new' | null>(null);
  const [editingRole, setEditingRole] = useState<Role | 'new' | null>(null);

  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<Staff[]>('/staff') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone gets their own login, so bills and voids are traceable."
        actions={
          view === 'staff' ? (
            <Button onClick={() => setEditingStaff('new')}>
              <Plus className="size-4" /> Add staff
            </Button>
          ) : (
            <Button onClick={() => setEditingRole('new')}>
              <Plus className="size-4" /> New role
            </Button>
          )
        }
      />

      <Tabs
        className="mb-6"
        value={view}
        onChange={setView}
        options={[
          { value: 'staff', label: `People${staff.data ? ` · ${staff.data.length}` : ''}` },
          { value: 'roles', label: 'Roles' },
        ]}
      />

      {view === 'staff' ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="hidden grid-cols-[1.6fr_1fr_1.2fr_auto] gap-4 border-b border-line px-5 py-2.5 text-xs text-ink-faint sm:grid">
            <span>Name</span>
            <span>Role</span>
            <span>Outlets</span>
            <span className="w-24 text-right">Sign in with</span>
          </div>
          {staff.isLoading &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="m-4 h-10" />)}
          <ul className="divide-y divide-line">
            {staff.data?.map((person, i) => (
              <m.li
                key={person.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
              >
                <button
                  onClick={() => setEditingStaff(person)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-paper/60 sm:grid-cols-[1.6fr_1fr_1.2fr_auto]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium',
                        person.isOwner ? 'bg-ink text-white' : 'bg-black/[0.06] text-ink-soft',
                      )}
                    >
                      {person.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'truncate text-sm',
                          person.status === 'INACTIVE' && 'text-ink-faint line-through',
                        )}
                      >
                        {person.name}
                      </p>
                      <p className="font-mono text-xs text-ink-faint">{person.employeeCode}</p>
                    </div>
                  </div>
                  <p className="hidden text-[13px] text-ink-soft sm:block">{person.role.name}</p>
                  <p className="hidden truncate text-[13px] text-ink-soft sm:block">
                    {person.isOwner || person.allOutlets
                      ? 'All outlets'
                      : person.outlets.map((o) => o.name).join(', ') || '—'}
                  </p>
                  <div className="flex w-24 justify-end gap-1">
                    {person.email && <Badge>Email</Badge>}
                    {person.hasPassword && <Badge>Password</Badge>}
                    {person.hasPin && <Badge>PIN</Badge>}
                  </div>
                </button>
              </m.li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.data?.map((role, i) => (
            <m.button
              key={role.id}
              onClick={() => setEditingRole(role)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-2xl border border-line bg-card p-5 text-left transition-colors hover:border-line-strong"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{role.name}</p>
                <span className="tabular text-xs text-ink-faint">
                  {role._count.users} {role._count.users === 1 ? 'person' : 'people'}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                {role.description || 'No description'}
              </p>
              <p className="mt-4 text-xs text-ink-faint">{role.permissions.length} permissions</p>
            </m.button>
          ))}
        </div>
      )}

      <StaffSheet
        staff={editingStaff}
        roles={roles.data ?? []}
        onClose={() => setEditingStaff(null)}
      />
      <RoleSheet role={editingRole} onClose={() => setEditingRole(null)} />
    </>
  );
}
