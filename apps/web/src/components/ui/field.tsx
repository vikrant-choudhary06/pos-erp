import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-[10px] border border-line bg-card px-3 text-sm text-ink placeholder:text-ink-faint ' +
  'transition-[border-color,box-shadow] duration-150 outline-none ' +
  'hover:border-line-strong focus:border-ink focus:ring-4 focus:ring-ink/[0.06] ' +
  'disabled:bg-paper disabled:text-ink-faint aria-invalid:border-danger';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(control, 'h-10', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2.5', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(control, 'h-10 appearance-none pr-9', className)} {...rest}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint" />
      </div>
    );
  },
);

type FieldProps = {
  label: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: (id: string) => React.ReactNode;
};

/** Label + control + hint. Children get the generated id for htmlFor. */
export function Field({ label, hint, optional, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] font-medium">
        {label}
        {optional && <span className="text-xs font-normal text-ink-faint">Optional</span>}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
