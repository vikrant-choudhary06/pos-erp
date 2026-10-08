import Link from 'next/link';
import { Logo } from '@/components/logo';
import { SmoothScroll } from '@/components/smooth-scroll';
import { ThemeToggle } from '@/components/theme-toggle';
import { BillPreview, Reveal, Steps } from './home-parts';

const FEATURES = [
  {
    title: 'Menu that keeps up',
    body: 'Half and full portions, add-ons, short codes for fast billing, and veg marks that print right.',
  },
  {
    title: 'KOT straight to the kitchen',
    body: 'Orders reach the right station the moment the waiter taps send. Extra items go as a new KOT.',
  },
  {
    title: 'GST without the headache',
    body: 'CGST and SGST split on every bill, invoice numbers that never skip, and a tax report ready for your CA.',
  },
  {
    title: 'A login for every person',
    body: 'Waiters, cashiers and chefs see only what they need. Discounts and voids ask for a manager PIN.',
  },
  {
    title: 'Stock that adds up',
    body: 'Recipes deduct ingredients as dishes sell, so the evening count tells you where the paneer went.',
  },
  {
    title: 'Works when the wifi doesn’t',
    body: 'Billing carries on offline and syncs when the connection is back. No lost orders in the rush.',
  },
];

export default function Home() {
  return (
    <SmoothScroll>
      <header className="sticky top-0 z-30 border-b border-transparent bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="flex items-center gap-1 text-[13px]">
            <a
              href="#features"
              className="hidden rounded-lg px-3 py-2 text-ink-soft hover:text-ink sm:block"
            >
              Features
            </a>
            <a
              href="#how"
              className="hidden rounded-lg px-3 py-2 text-ink-soft hover:text-ink sm:block"
            >
              How it works
            </a>
            <ThemeToggle />
            <Link
              href="/login"
              className="ml-2 rounded-[10px] bg-ink px-4 py-2 font-medium text-on-ink transition-colors hover:bg-ink/85"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-6 pt-16 pb-24 lg:grid-cols-[1.1fr_1fr] lg:pt-28">
          <Reveal>
            <p className="text-[13px] font-medium text-ink-soft">
              For restaurants, cafes and cloud kitchens
            </p>
            <h1 className="mt-5 text-[44px] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-6xl">
              Run the floor,
              <br />
              the kitchen
              <br />
              <span className="text-ink-faint">and the books.</span>
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-soft">
              Billing, KOTs, menu, stock and staff in one place. Set up your outlet in a few
              minutes, no installation needed.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-ink px-5 py-3 text-[15px] font-medium text-on-ink transition-[background-color,transform] hover:bg-ink/85 active:scale-[0.98]"
              >
                Start free trial
              </Link>
              <a
                href="#how"
                className="rounded-xl px-4 py-3 text-[15px] text-ink-soft transition-colors hover:text-ink"
              >
                See how it works →
              </a>
            </div>
          </Reveal>

          <BillPreview />
        </section>

        <section id="features" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <h2 className="max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything a busy counter needs. Nothing it doesn’t.
              </h2>
            </Reveal>
            <div className="mt-16 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} delay={(i % 3) * 0.08}>
                  <p className="tabular font-mono text-xs text-ink-faint">0{i + 1}</p>
                  <h3 className="mt-3 text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{feature.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-line bg-card">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[1fr_1.2fr]">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <Reveal>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  From order to bill
                </h2>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-soft">
                  The same order moves from the waiter to the kitchen to the cashier, and lands in
                  your reports without anyone copying it down.
                </p>
              </Reveal>
            </div>
            <Steps />
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-28 text-center">
            <Reveal>
              <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight sm:text-5xl">
                Your first bill is ten minutes away.
              </h2>
              <Link
                href="/login"
                className="mt-10 inline-block rounded-xl bg-ink px-6 py-3.5 text-[15px] font-medium text-on-ink transition-[background-color,transform] hover:bg-ink/85 active:scale-[0.98]"
              >
                Create your account
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-ink-faint">
          <Logo />
          <p>Made in India</p>
        </div>
      </footer>
    </SmoothScroll>
  );
}
