import Link from 'next/link';
import { MarketingHeader } from '@/components/site-header';
import { LogoMark } from '@/components/ui';
import { getUser } from '@/lib/auth';
import { appOrigin } from '@/lib/origin';

const FEATURES = [
  {
    title: 'Real visitors, not lab runs',
    body: 'LCP, INP and CLS measured in your visitors’ browsers with Google’s web-vitals library, reported at p75 like Search Console does.',
  },
  {
    title: 'Find the slow pages',
    body: 'Every page ranked by how it actually performs, split by device and country, with the element or interaction behind the bad scores.',
  },
  {
    title: 'Know when a deploy hurts',
    body: 'Regression checks compare today with yesterday and alert you by email or Slack: “LCP got 40% worse since release v2.3.”',
  },
  {
    title: 'Fixes, not just numbers',
    body: 'Each slow page gets concrete suggestions based on what was measured: preload this hero image, reserve space for that banner.',
  },
];

const STEPS = [
  { title: 'Add your site', body: 'Sign up and enter your domain. You get a site key straight away.' },
  { title: 'Paste one script tag', body: 'Put it in the <head> of your layout. It is 250 bytes and never blocks rendering.' },
  { title: 'Watch real data arrive', body: 'Scores show up as visitors leave each page: by page, device and country.' },
];

export default async function Home() {
  const [origin, user] = await Promise.all([appOrigin(), getUser()]);
  return (
    <div className="flex flex-1 flex-col">
      <MarketingHeader user={user} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            See how fast your site really is for the people using it.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-2">
            Paste one script tag. VitalSigns collects Core Web Vitals from real visitors, shows you the slowest pages,
            and tells you when a deploy makes things worse.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={user ? '/dashboard' : '/signup'}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
            >
              {user ? 'Open your dashboard' : 'Get your script tag'}
            </Link>
            <a href="#how-it-works" className="rounded-lg border border-line bg-surface px-5 py-2.5 font-medium hover:bg-surface-2">
              How it works
            </a>
          </div>

          <div className="mt-12 max-w-2xl overflow-x-auto rounded-xl border border-line bg-surface p-4">
            <p className="mb-2 text-xs font-medium text-muted">Add to every page, before &lt;/head&gt;</p>
            <pre className="font-mono text-sm text-ink">
              <code>{`<script defer src="${origin}/v1.js"\n        data-site="vs_your_site_key"></script>`}</code>
            </pre>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            The tag loads a 250-byte loader. The collector is fetched asynchronously at low priority, sends a
            single beacon when the visitor leaves the page, and never blocks rendering.
          </p>
        </section>

        <section id="features" className="scroll-mt-20 pb-20">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">Features</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 pb-24">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-surface p-5">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <LogoMark size={16} />
            VitalSigns: real-user monitoring for Core Web Vitals.
          </span>
          <span>© {new Date().getFullYear()} VitalSigns</span>
        </div>
      </footer>
    </div>
  );
}
