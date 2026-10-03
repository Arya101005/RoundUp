import { Link } from 'react-router-dom';
import { PageShell } from '@/components/common/PageShell';
import { EmptyState } from '@/components/common/States';
import { routes } from '@/config/routes';

export function NotFoundPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <EmptyState
          title="Page not found."
          description="The page you are looking for does not exist or has moved."
          action={
            <Link
              to={routes.home}
              className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              Back to home
            </Link>
          }
        />
      </div>
    </PageShell>
  );
}
