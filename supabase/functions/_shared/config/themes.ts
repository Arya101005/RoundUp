import type { GameId } from '../games/types.ts';

export interface RankingCriterion {
  id: string;
  label: string;
  metricLabel: string;
  direction: 'asc' | 'desc';
}

export interface ThemeConfig {
  id: string;
  label: string;
  /** lucide-react icon name; resolved to a component in the frontend. */
  icon: string;
  supportedGames: GameId[];
  categories: string[];
  /** Blind Ranking criteria this theme can answer objectively. */
  rankingCriteria: RankingCriterion[];
  /** Label for the hidden numeric metric used by Auction. */
  auctionValueMetric: string;
  /** Sanity bounds for AI-sourced reference values. */
  auctionValueRange: { min: number; max: number };
  aiPromptHints: string;
}

const ALL_GAMES: GameId[] = [
  'imposter',
  'heads_up',
  'password',
  'charades',
  'blind_ranking',
  'auction',
];

export const themes: ThemeConfig[] = [
  {
    id: 'food',
    label: 'Food',
    icon: 'UtensilsCrossed',
    supportedGames: ALL_GAMES,
    categories: ['Dishes', 'Ingredients', 'Cuisines', 'Street food'],
    rankingCriteria: [
      { id: 'calories', label: 'Calories per 100g, highest first', metricLabel: 'kcal / 100g', direction: 'desc' },
    ],
    auctionValueMetric: 'Approximate price per kg (USD)',
    auctionValueRange: { min: 1, max: 500 },
    aiPromptHints: 'Everyday foods, dishes and ingredients recognisable across cultures.',
  },
  {
    id: 'animals',
    label: 'Animals',
    icon: 'PawPrint',
    supportedGames: ALL_GAMES,
    categories: ['Mammals', 'Birds', 'Reptiles', 'Sea life'],
    rankingCriteria: [
      { id: 'weight', label: 'Body weight, heaviest first', metricLabel: 'kg', direction: 'desc' },
      { id: 'speed', label: 'Top speed, fastest first', metricLabel: 'km/h', direction: 'desc' },
    ],
    auctionValueMetric: 'Conservation value index (USD)',
    auctionValueRange: { min: 10, max: 5000 },
    aiPromptHints: 'Well-known wild and domestic animals with verifiable physical statistics.',
  },
  {
    id: 'movies',
    label: 'Movies',
    icon: 'Clapperboard',
    supportedGames: ALL_GAMES,
    categories: ['Blockbusters', 'Animation', 'Classics', 'Franchises'],
    rankingCriteria: [
      { id: 'box_office', label: 'Worldwide box office, highest first', metricLabel: 'USD millions', direction: 'desc' },
      { id: 'runtime', label: 'Runtime, longest first', metricLabel: 'minutes', direction: 'desc' },
    ],
    auctionValueMetric: 'Production budget (USD millions)',
    auctionValueRange: { min: 1, max: 400 },
    aiPromptHints: 'Famous theatrical films, titles exactly as released.',
  },
  {
    id: 'countries',
    label: 'Countries',
    icon: 'Globe2',
    supportedGames: ALL_GAMES,
    categories: ['Capitals', 'Continents', 'Islands', 'Landmarks'],
    rankingCriteria: [
      { id: 'population', label: 'Population, highest first', metricLabel: 'people', direction: 'desc' },
      { id: 'area', label: 'Land area, largest first', metricLabel: 'km²', direction: 'desc' },
    ],
    auctionValueMetric: 'GDP per capita (USD)',
    auctionValueRange: { min: 100, max: 120000 },
    aiPromptHints: 'Sovereign states with official English short names.',
  },
  {
    id: 'technology',
    label: 'Technology',
    icon: 'Cpu',
    supportedGames: ALL_GAMES,
    categories: ['Devices', 'Companies', 'Software', 'Inventions'],
    rankingCriteria: [
      { id: 'market_cap', label: 'Company market cap, highest first', metricLabel: 'USD billions', direction: 'desc' },
      { id: 'founded', label: 'Year founded, oldest first', metricLabel: 'year', direction: 'asc' },
    ],
    auctionValueMetric: 'Flagship product price (USD)',
    auctionValueRange: { min: 50, max: 5000 },
    aiPromptHints: 'Mainstream technology products and companies familiar to a general audience.',
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: 'BadgeSports',
    supportedGames: ALL_GAMES,
    categories: ['Players', 'Teams', 'Stadiums', 'Tournaments', 'Olympic sports'],
    rankingCriteria: [
      { id: 'goals', label: 'Career goals, most first', metricLabel: 'goals', direction: 'desc' },
      { id: 'matches', label: 'Matches played, most first', metricLabel: 'matches', direction: 'desc' },
    ],
    auctionValueMetric: 'Market value (USD millions)',
    auctionValueRange: { min: 1, max: 250 },
    aiPromptHints: 'Athletes, teams and tournaments from any sport the room recognises.',
  },
  {
    id: 'cricket',
    label: 'Cricket',
    icon: 'Trophy',
    supportedGames: ALL_GAMES,
    categories: ['Players', 'Teams', 'Tournaments', 'Venues'],
    rankingCriteria: [
      { id: 'runs', label: 'Career international runs, highest first', metricLabel: 'runs', direction: 'desc' },
      { id: 'rating', label: 'ICC rating, highest first', metricLabel: 'rating points', direction: 'desc' },
    ],
    auctionValueMetric: 'Career prize earnings (USD thousands)',
    auctionValueRange: { min: 50, max: 5000 },
    aiPromptHints: 'Internationally recognised cricketers, teams and tournaments.',
  },
  {
    id: 'football',
    label: 'Football',
    icon: 'Goal',
    supportedGames: ALL_GAMES,
    categories: ['Players', 'Clubs', 'Tournaments', 'Stadiums'],
    rankingCriteria: [
      { id: 'market_value', label: 'Player market value, highest first', metricLabel: 'USD millions', direction: 'desc' },
      { id: 'goals', label: 'Career goals, most first', metricLabel: 'goals', direction: 'desc' },
    ],
    auctionValueMetric: 'Market value (USD millions)',
    auctionValueRange: { min: 1, max: 250 },
    aiPromptHints: 'Globally known footballers and clubs.',
  },
  {
    id: 'music',
    label: 'Music',
    icon: 'Music',
    supportedGames: ALL_GAMES,
    categories: ['Artists', 'Bands', 'Instruments', 'Genres'],
    rankingCriteria: [
      { id: 'monthly_listeners', label: 'Monthly listeners, highest first', metricLabel: 'millions', direction: 'desc' },
      { id: 'albums', label: 'Studio albums, most first', metricLabel: 'albums', direction: 'desc' },
    ],
    auctionValueMetric: 'Catalogue valuation index (USD)',
    auctionValueRange: { min: 10, max: 5000 },
    aiPromptHints: 'Mainstream artists and bands with large public followings.',
  },
  {
    id: 'science',
    label: 'Science',
    icon: 'FlaskConical',
    supportedGames: ALL_GAMES,
    categories: ['Elements', 'Discoveries', 'Scientists', 'Space'],
    rankingCriteria: [
      { id: 'atomic_number', label: 'Atomic number, highest first', metricLabel: 'atomic number', direction: 'desc' },
      { id: 'discovered', label: 'Year discovered, earliest first', metricLabel: 'year', direction: 'asc' },
    ],
    auctionValueMetric: 'Industrial rarity index (USD)',
    auctionValueRange: { min: 10, max: 10000 },
    aiPromptHints: 'Textbook science facts with objectively verifiable numbers.',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: 'Gamepad2',
    supportedGames: ALL_GAMES,
    categories: ['Consoles', 'Characters', 'Studios', 'Genres'],
    rankingCriteria: [
      { id: 'copies', label: 'Copies sold, most first', metricLabel: 'millions', direction: 'desc' },
      { id: 'metacritic', label: 'Metacritic score, highest first', metricLabel: 'score', direction: 'desc' },
    ],
    auctionValueMetric: 'Original retail price (USD)',
    auctionValueRange: { min: 10, max: 600 },
    aiPromptHints: 'Widely played video games and consoles.',
  },
  {
    id: 'cars',
    label: 'Cars',
    icon: 'Car',
    supportedGames: ALL_GAMES,
    categories: ['Brands', 'Models', 'Supercars', 'Classics'],
    rankingCriteria: [
      { id: 'horsepower', label: 'Horsepower, highest first', metricLabel: 'hp', direction: 'desc' },
      { id: 'price', label: 'Base price, highest first', metricLabel: 'USD', direction: 'desc' },
    ],
    auctionValueMetric: 'Current market value (USD)',
    auctionValueRange: { min: 5000, max: 3000000 },
    aiPromptHints: 'Recognisable production cars with published specifications.',
  },
  {
    id: 'history',
    label: 'History',
    icon: 'Landmark',
    supportedGames: ALL_GAMES,
    categories: ['Leaders', 'Events', 'Wars', 'Civilisations'],
    rankingCriteria: [
      { id: 'year', label: 'Year occurred, earliest first', metricLabel: 'year BC/AD', direction: 'asc' },
      { id: 'duration', label: 'Duration, longest first', metricLabel: 'years', direction: 'desc' },
    ],
    auctionValueMetric: 'Historical significance index (USD)',
    auctionValueRange: { min: 10, max: 10000 },
    aiPromptHints: 'Well-dated historical events and figures taught in schools worldwide.',
  },
  {
    id: 'auction',
    label: 'Auction',
    icon: 'Gavel',
    supportedGames: ALL_GAMES,
    categories: ['Lots', 'Players', 'Bidders', 'Bidding'],
    rankingCriteria: [
      { id: 'value', label: 'Highest value won, most first', metricLabel: 'USD', direction: 'desc' },
    ],
    auctionValueMetric: 'Winning bid (USD)',
    auctionValueRange: { min: 50, max: 50000 },
    aiPromptHints: 'Well-known commodities and collectibles with published starting bids.',
  },
];

export const themeIds = themes.map((t) => t.id);

export function getTheme(id: string): ThemeConfig | undefined {
  return themes.find((t) => t.id === id);
}

export function isThemeId(id: string): boolean {
  return themeIds.includes(id);
}

export function themeSupportsGame(themeId: string, gameId: GameId): boolean {
  const theme = getTheme(themeId);
  return theme ? theme.supportedGames.includes(gameId) : false;
}
