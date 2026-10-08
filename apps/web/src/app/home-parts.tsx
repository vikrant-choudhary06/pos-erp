'use client';

import { useScroll, useTransform } from 'motion/react';
import * as m from 'motion/react-m';
import { useRef } from 'react';
import { FoodMark } from '@/components/ui/misc';

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}

const LINES = [
  { name: 'Paneer Tikka', note: 'Full', qty: 1, price: 280, type: 'VEG' as const },
  { name: 'Dal Makhani', note: '', qty: 2, price: 220, type: 'VEG' as const },
  { name: 'Butter Naan', note: '', qty: 4, price: 50, type: 'VEG' as const },
  { name: 'Chicken Biryani', note: 'Half', qty: 1, price: 210, type: 'NON_VEG' as const },
];

export function BillPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const billY = useTransform(scrollYProgress, [0, 1], [30, -40]);
  const kotY = useTransform(scrollYProgress, [0, 1], [60, -90]);
  const kotRotate = useTransform(scrollYProgress, [0, 1], [4, -2]);

  const subtotal = LINES.reduce((sum, l) => sum + l.qty * l.price, 0);
  const gst = Math.round(subtotal * 0.05 * 100) / 100;

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[380px] pb-10">
      <m.div
        style={{ y: kotY, rotate: kotRotate }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="absolute -top-20 -right-2 z-10 w-44 rounded-xl border border-line bg-card p-4 font-mono text-[11px] shadow-xl shadow-black/[0.06] will-change-transform sm:-right-12"
      >
        <p className="flex justify-between text-ink-faint">
          <span>KOT #17</span>
          <span>T4</span>
        </p>
        <div className="mt-2 space-y-1 border-t border-dashed border-line pt-2">
          <p>2 × Dal Makhani</p>
          <p>4 × Butter Naan</p>
          <p className="text-ink-faint">less oil</p>
        </div>
      </m.div>

      {/* outer layer follows the scroll, inner one handles the entrance */}
      <m.div style={{ y: billY }} className="will-change-transform">
        <m.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-line bg-card p-6 shadow-2xl shadow-black/[0.06]"
        >
          <div className="text-center">
            <p className="text-sm font-semibold">Sharma Dhaba</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              MG Road, Indore · GSTIN 23ABCDE1234F1Z5
            </p>
          </div>
          <div className="mt-4 flex justify-between border-y border-dashed border-line py-2 font-mono text-[11px] text-ink-faint">
            <span>IND01/D1/26-27/000124</span>
            <span>Table 4</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {LINES.map((line, i) => (
              <m.li
                key={line.name}
                className="flex items-start gap-2 text-[13px]"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.12 }}
              >
                <FoodMark type={line.type} className="mt-0.5 size-3" />
                <span className="flex-1">
                  {line.name}
                  {line.note && <span className="text-ink-faint"> · {line.note}</span>}
                </span>
                <span className="tabular w-6 text-right text-ink-faint">{line.qty}</span>
                <span className="tabular w-14 text-right">{line.qty * line.price}</span>
              </m.li>
            ))}
          </ul>
          <div className="tabular mt-4 space-y-1 border-t border-dashed border-line pt-3 text-[12px] text-ink-soft">
            <p className="flex justify-between">
              <span>Subtotal</span>
              <span>{subtotal.toFixed(2)}</span>
            </p>
            <p className="flex justify-between">
              <span>CGST 2.5%</span>
              <span>{(gst / 2).toFixed(2)}</span>
            </p>
            <p className="flex justify-between">
              <span>SGST 2.5%</span>
              <span>{(gst / 2).toFixed(2)}</span>
            </p>
          </div>
          <p className="tabular mt-3 flex justify-between border-t border-line pt-3 text-base font-semibold">
            <span>Total</span>
            <span>₹{Math.round(subtotal + gst)}</span>
          </p>
          <p className="mt-4 text-center text-[11px] text-ink-faint">
            Paid by UPI · Thank you, visit again
          </p>
        </m.div>
      </m.div>
    </div>
  );
}

const STEPS = [
  {
    label: 'Order',
    title: 'Waiter picks the table and taps in the dishes',
    body: 'Short codes and portion buttons keep it quick, even on a phone.',
  },
  {
    label: 'Kitchen',
    title: 'KOT prints at the right station',
    body: 'Tandoor gets the naans, the bar gets the drinks. The kitchen screen shows what is waiting and for how long.',
  },
  {
    label: 'Bill',
    title: 'Cashier settles in one go',
    body: 'Split between cash and UPI, apply a discount with manager approval, print or send on WhatsApp.',
  },
  {
    label: 'Reports',
    title: 'Day closes with numbers that match',
    body: 'Sales by item and hour, cash in the drawer versus the system, GST summary for the month.',
  },
];

export function Steps() {
  return (
    <ol className="space-y-4">
      {STEPS.map((step, i) => (
        <m.li
          key={step.label}
          className="rounded-2xl border border-line bg-paper p-6 sm:p-8"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="flex items-center gap-3 text-xs font-medium text-ink-faint">
            <span className="tabular grid size-6 place-items-center rounded-full border border-line-strong font-mono">
              {i + 1}
            </span>
            {step.label}
          </p>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{step.body}</p>
        </m.li>
      ))}
    </ol>
  );
}
