import { Link } from 'react-router-dom';
import { Github, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { brand } from '@/config/brand';
import { routes } from '@/config/routes';
import { applyTheme, getStoredTheme, type ThemeMode } from '@/utils/theme';

function ThemeButton() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);
  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`Switch to ${next} theme`}
      className="rounded-md border border-line bg-elevated p-2 text-muted transition hover:border-accent/60 hover:text-ink"
    >
      {mode === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export function PageShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-bg/80 backdrop-blur">
        <div className={wide ? 'mx-auto w-full max-w-6xl px-4' : 'mx-auto w-full max-w-3xl px-4'}>
          <div className="flex h-14 items-center justify-between">
            <Link
              to={routes.home}
              className="font-display text-lg font-bold tracking-tight text-ink transition hover:text-accent"
            >
              {brand.name}
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to={routes.privacy}
                className="hidden text-sm text-muted transition hover:text-ink sm:inline"
              >
                Privacy
              </Link>
              <Link
                to={routes.terms}
                className="hidden text-sm text-muted transition hover:text-ink sm:inline"
              >
                Terms
              </Link>
              <ThemeButton />
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:flex-row">
        <p>
          {brand.name} &middot; {brand.tagline}
        </p>
        <div className="flex items-center gap-4">
          {brand.repoUrl && (
            <a
              href={brand.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition hover:text-ink"
            >
              <Github className="h-4 w-4" aria-hidden />
              GitHub
            </a>
          )}
          <Link to={routes.privacy} className="transition hover:text-ink">
            Privacy
          </Link>
          <Link to={routes.terms} className="transition hover:text-ink">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
