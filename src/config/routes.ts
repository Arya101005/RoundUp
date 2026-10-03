/** Routes used across the app. */
export const routes = {
  home: '/',
  create: '/create',
  join: '/join',
  joinWithCode: (code: string) => `/join/${code.toUpperCase()}`,
  room: (code: string) => `/room/${code.toUpperCase()}`,
  game: (sessionId: string) => `/game/${sessionId}`,
  results: (sessionId: string) => `/results/${sessionId}`,
  privacy: '/privacy',
  terms: '/terms',
} as const;
