import { PageShell } from '@/components/common/PageShell';
import { brand } from '@/config/brand';

const sections = [
  {
    heading: 'What we store',
    body: [
      'A guest display name you choose (per room), your chat messages, and gameplay data such as scores and results.',
      'A random anonymous identifier created by Supabase so your seat survives a page refresh. No email, password, or profile is collected.',
    ],
  },
  {
    heading: 'What we do not do',
    body: [
      'No advertising, no sale of data, and no third-party analytics or tracking.',
      'We do not read the contents of your device beyond what the app needs to run.',
    ],
  },
  {
    heading: 'Operational logs',
    body: [
      'Hosting providers (Vercel and Supabase) keep standard operational logs for security and debugging, retained per their policies.',
    ],
  },
  {
    heading: 'Retention',
    body: [
      'Rooms close automatically after six hours of inactivity. Game data is removed by scheduled cleanup jobs. Chat lives only while its room exists.',
    ],
  },
  {
    heading: 'Contact',
    body: ['Questions about this policy can be raised in the project repository.'],
  },
] as const;

export function PrivacyPage() {
  return (
    <PageShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="font-display text-2xl font-semibold text-ink">Privacy</h1>
        <p className="mt-2 text-sm text-muted">
          A short, plain description of what {brand.name} stores and why.
        </p>
        <div className="mt-8 flex flex-col gap-7">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-base font-semibold text-ink">{section.heading}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </PageShell>
  );
}
