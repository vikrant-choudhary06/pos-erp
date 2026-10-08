'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Dialog, Sheet } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api';
import type { Category } from '@/lib/types';

type Props = {
  category: Category | 'new' | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

export function CategorySheet({ category, onClose, onDeleted }: Props) {
  const queryClient = useQueryClient();
  const isNew = category === 'new';
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (category) setName(isNew ? '' : category.name);
  }, [category, isNew]);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api('/menu/categories', { method: 'POST', body: { name } })
        : api(`/menu/categories/${(category as Category).id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast.success(isNew ? 'Category added' : 'Category saved');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/menu/categories/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category deleted');
      setConfirming(false);
      onDeleted(id);
      onClose();
    },
    onError: (err) => {
      setConfirming(false);
      toast.error(errorMessage(err));
    },
  });

  return (
    <>
      <Sheet
        open={category !== null}
        onClose={onClose}
        title={isNew ? 'New category' : 'Edit category'}
        footer={
          <>
            {!isNew && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button form="category-form" type="submit" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form
          id="category-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Starters"
                autoFocus
                required
              />
            )}
          </Field>
        </form>
      </Sheet>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this category?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => category && category !== 'new' && remove.mutate(category.id)}
            >
              Delete
            </Button>
          </>
        }
      >
        Only empty categories can be deleted.
      </Dialog>
    </>
  );
}
