import { PageShell } from '@/components/common/PageShell';
import { brand } from '@/config/brand';

const sections = [
  {
    heading: 'What this service is',
    body: [
      `${brand.name} is a casual party-games web app. Rooms are temporary and close automatically after inactivity.`,
    ],
  },
  {
    heading: 'Fair play',
    body: [
      'Do not use the service to harass other players, post abusive content, or disrupt rooms you were invited to.',
      'Chat is rate limited and moderated by simple length and content rules; hosts can leave or close rooms at any time.',
    ],
  },
  {
    heading: 'Availability',
    body: [
      'The service is provided as is, with no uptime guarantee. Games in progress may be interrupted by maintenance or outages.',
    ],
  },
  {
    heading: 'Content and licensing',
    body: [
      'Game content is sourced from public data providers, generated on demand, or supplied with the app. The software itself is licensed under the repository license.',
    ],
  },
] as const;

export function TermsPage() {
  return (
    <PageShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="font-display text-2xl font-semibold text-ink">Terms</h1>
        <p className="mt-2 text-sm text-muted">
          Plain-language terms for using {brand.name}.
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
