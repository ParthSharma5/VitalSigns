import Link from 'next/link';
import { Logo } from '@/components/ui';
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
    body: 'Hourly regression checks compare today with yesterday and alert you by email or Slack: “LCP got 40% worse since release v2.3.”',
  },
  {
    title: 'Fixes, not just numbers',
    body: 'Each slow page gets concrete suggestions based on what was measured: preload this hero image, reserve space for that banner.',
  },
];

export default async function Home() {
  const origin = await appOrigin();
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-ink-2 hover:text-ink">Log in</Link>
          <Link href="/signup" className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">
            Sign up free
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            See how fast your site really is for the people using it.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-2">
            Paste one script tag. VitalSigns collects Core Web Vitals from real visitors, shows you the slowest pages,
            and tells you when a deploy makes things worse.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90">
              Get your script tag
            </Link>
            <Link href="/login" className="rounded-lg border border-line bg-surface px-5 py-2.5 font-medium hover:bg-surface-2">
              Log in
            </Link>
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

        <section className="grid gap-4 pb-24 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-ink-2">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        VitalSigns: real-user monitoring for Core Web Vitals.
      </footer>
    </div>
  );
}
