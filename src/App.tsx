import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/common/Toast';
import { TooltipProvider } from '@/components/common/Tooltip';
import { LoadingState } from '@/components/common/States';
import { routes } from '@/config/routes';

// Route-level code splitting keeps the initial bundle small.
const page = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader);
const LandingPage = page(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const CreateRoomPage = page(() => import('@/pages/CreateRoomPage').then((m) => ({ default: m.CreateRoomPage })));
const JoinRoomPage = page(() => import('@/pages/JoinRoomPage').then((m) => ({ default: m.JoinRoomPage })));
const RoomPage = page(() => import('@/pages/RoomPage').then((m) => ({ default: m.RoomPage })));
const GamePage = page(() => import('@/pages/GamePage').then((m) => ({ default: m.GamePage })));
const ResultsPage = page(() => import('@/pages/ResultsPage').then((m) => ({ default: m.ResultsPage })));
const PrivacyPage = page(() => import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = page(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })));
const NotFoundPage = page(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

export function App() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <BrowserRouter>
            <Suspense
              fallback={
                <div className="flex min-h-dvh items-center justify-center">
                  <LoadingState message="Loading..." />
                </div>
              }
            >
              <Routes>
                <Route path={routes.home} element={<LandingPage />} />
                <Route path={routes.create} element={<CreateRoomPage />} />
                <Route path={routes.join} element={<JoinRoomPage />} />
                <Route path="/join/:roomCode" element={<JoinRoomPage />} />
                <Route path="/room/:roomCode" element={<RoomPage />} />
                <Route path="/game/:sessionId" element={<GamePage />} />
                <Route path="/results/:sessionId" element={<ResultsPage />} />
                <Route path={routes.privacy} element={<PrivacyPage />} />
                <Route path={routes.terms} element={<TermsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </TooltipProvider>
  );
}
