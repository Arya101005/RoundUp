/**
 * Seed content bank (Phase 4 fallback): curated words, ranking references and
 * auction lots for every theme. Pure data — imported by Edge Functions (Deno),
 * Vitest (Node) and engines. The AI pipeline can supersede entries later; the
 * seed bank guarantees every game is playable with no network dependencies.
 */
import type { Difficulty } from '../games/types.ts';

/** Words per theme, grouped by the theme's category, easiest first. */
export const seedWords: Record<string, Record<string, string[]>> = {
  food: {
    Dishes: ['Pizza', 'Pasta', 'Sushi', 'Tacos', 'Burger', 'Curry', 'Ramen', 'Paella'],
    Ingredients: ['Tomato', 'Cheese', 'Onion', 'Garlic', 'Rice', 'Chicken', 'Basil', 'Saffron'],
    Cuisines: ['Italian', 'Chinese', 'Mexican', 'Indian', 'Japanese', 'Thai', 'French', 'Turkish'],
    'Street food': ['Hot dog', 'Doner kebab', 'Falafel', 'Churros', 'Samosa', 'Pretzel', 'Waffle', 'Gyro'],
  },
  animals: {
    Mammals: ['Dog', 'Cat', 'Horse', 'Lion', 'Tiger', 'Elephant', 'Giraffe', 'Dolphin'],
    Birds: ['Eagle', 'Parrot', 'Penguin', 'Ostrich', 'Sparrow', 'Flamingo', 'Owl', 'Peacock'],
    Reptiles: ['Lizard', 'Snake', 'Crocodile', 'Turtle', 'Chameleon', 'Iguana', 'Gecko', 'Komodo dragon'],
    'Sea life': ['Shark', 'Octopus', 'Jellyfish', 'Crab', 'Lobster', 'Seahorse', 'Starfish', 'Eel'],
  },
  movies: {
    Blockbusters: ['Avatar', 'Titanic', 'Avengers', 'Frozen', 'Jurassic Park', 'Star Wars', 'The Dark Knight', 'Inception'],
    Animation: ['Toy Story', 'Finding Nemo', 'Shrek', 'Up', 'Coco', 'Ratatouille', 'Monsters Inc', 'Wall-E'],
    Classics: ['Casablanca', 'Psycho', 'The Godfather', 'Citizen Kane', 'Breakfast at Tiffany’s', 'Singin in the Rain', '12 Angry Men', 'Some Like It Hot'],
    Franchises: ['Harry Potter', 'James Bond', 'Fast and Furious', 'Mission Impossible', 'Lord of the Rings', 'Indiana Jones', 'Spider-Man', 'Transformers'],
  },
  countries: {
    Capitals: ['Paris', 'Tokyo', 'London', 'Berlin', 'Madrid', 'Rome', 'Ottawa', 'Nairobi'],
    Continents: ['Asia', 'Europe', 'Africa', 'Australia', 'Antarctica', 'North America', 'South America', 'Eurasia'],
    Islands: ['Madagascar', 'Borneo', 'Bali', 'Sicily', 'Hawaii', 'Fiji', 'Crete', 'Sri Lanka'],
    Landmarks: ['Eiffel Tower', 'Great Wall', 'Taj Mahal', 'Big Ben', 'Statue of Liberty', 'Colosseum', 'Machu Picchu', 'Pyramids'],
  },
  technology: {
    Devices: ['Phone', 'Laptop', 'Tablet', 'Headphones', 'Keyboard', 'Camera', 'Printer', 'Smartwatch'],
    Companies: ['Apple', 'Google', 'Microsoft', 'Samsung', 'Sony', 'Nokia', 'Tesla', 'IBM'],
    Software: ['Windows', 'Photoshop', 'Spotify', 'Skype', 'Chrome', 'Excel', 'Linux', 'Firefox'],
    Inventions: ['Telephone', 'Television', 'Radio', 'Printing press', 'Light bulb', 'Bicycle', 'Airplane', 'Compass'],
  },
  sports: {
    Players: ['Usain Bolt', 'Michael Jordan', 'Serena Williams', 'Novak Djokovic', 'Lewis Hamilton', 'Simone Biles', 'Muhammad Ali', 'Federer'],
    Teams: ['Lakers', 'Warriors', 'Barcelona', 'India', 'Chiefs', 'Yankees', 'Real Madrid', 'All Blacks'],
    Stadiums: ['Wembley', 'Madison Square Garden', 'Maracanã', 'MCG', 'Wankhede', 'Santiago Bernabéu', 'Lord’s', 'Melbourne Arena'],
    Tournaments: ['World Cup', 'Olympics', 'Super Bowl', 'Wimbledon', 'ICC Champions Trophy', 'Premier League', 'Tour de France', 'Grand Slam'],
    'Olympic sports': ['Athletics', 'Swimming', 'Gymnastics', 'Rowing', 'Cycling', 'Boxing', 'Judo', 'Weightlifting'],
  },
  cricket: {
    Players: ['Kohli', 'Smith', 'Williamson', 'Root', 'Warner', 'Babar', 'Rohit', 'Ponting'],
    Teams: ['India', 'Australia', 'England', 'Pakistan', 'South Africa', 'New Zealand', 'West Indies', 'Sri Lanka'],
    Tournaments: ['World Cup', 'Ashes', 'IPL', 'Big Bash', 'Champions Trophy', 'T20 World Cup', 'Border Gavaskar', 'Ranji Trophy'],
    Venues: ['MCG', 'Lord’s', 'Eden Gardens', 'Wankhede', 'The Oval', 'Headingley', 'Newlands', 'Sabina Park'],
  },
  football: {
    Players: ['Messi', 'Ronaldo', 'Neymar', 'Mbappe', 'Salah', 'Haaland', 'Vinicius', 'Zidane'],
    Clubs: ['Real Madrid', 'Barcelona', 'Manchester United', 'Liverpool', 'Bayern', 'Juventus', 'Arsenal', 'Chelsea'],
    Tournaments: ['World Cup', 'Champions League', 'Premier League', 'La Liga', 'Euros', 'Copa America', 'FA Cup', 'Bundesliga'],
    Stadiums: ['Wembley', 'Camp Nou', 'Old Trafford', 'Maracana', 'San Siro', 'Bernabeu', 'Anfield', 'Allianz Arena'],
  },
  music: {
    Artists: ['Adele', 'Ed Sheeran', 'Taylor Swift', 'Eminem', 'Bruno Mars', 'Billie Eilish', 'Drake', 'Beyonce'],
    Bands: ['Beatles', 'Queen', 'Nirvana', 'Backstreet Boys', 'Coldplay', 'Oasis', 'Imagine Dragons', 'ABBA'],
    Instruments: ['Guitar', 'Piano', 'Drums', 'Violin', 'Flute', 'Saxophone', 'Trumpet', 'Harp'],
    Genres: ['Rock', 'Jazz', 'Hip hop', 'Classical', 'Pop', 'Reggae', 'Blues', 'Electronic'],
  },
  science: {
    Elements: ['Hydrogen', 'Oxygen', 'Carbon', 'Gold', 'Iron', 'Helium', 'Neon', 'Uranium'],
    Discoveries: ['Gravity', 'Penicillin', 'DNA', 'Evolution', 'Relativity', 'X-ray', 'Vaccine', 'Radioactivity'],
    Scientists: ['Einstein', 'Newton', 'Curie', 'Darwin', 'Tesla', 'Galileo', 'Hawking', 'Bor'],
    Space: ['Mars', 'Jupiter', 'Galaxy', 'Comet', 'Nebula', 'Eclipse', 'Satellite', 'Black hole'],
  },
  gaming: {
    Consoles: ['PlayStation', 'Xbox', 'Nintendo Switch', 'Game Boy', 'Atari', 'Wii', 'Sega Genesis', 'Steam Deck'],
    Characters: ['Mario', 'Sonic', 'Pikachu', 'Lara Croft', 'Master Chief', 'Kratos', 'Zelda', 'Mega Man'],
    Studios: ['Nintendo', 'Electronic Arts', 'Activision', 'Ubisoft', 'Rockstar', 'Blizzard', 'Valve', 'Sega'],
    Genres: ['Racing', 'Puzzle', 'Shooter', 'Platformer', 'Strategy', 'RPG', 'Horror', 'Sports'],
  },
  cars: {
    Brands: ['Toyota', 'Ford', 'BMW', 'Mercedes', 'Honda', 'Tesla', 'Ferrari', 'Lamborghini'],
    Models: ['Corolla', 'Civic', 'Mustang', 'Golf', 'Camry', 'Wrangler', 'Prius', 'Explorer'],
    Supercars: ['Chiron', 'Aventador', 'Huracan', 'McLaren', 'Pagani', 'Koenigsegg', 'Countach', 'Testarossa'],
    Classics: ['Beetle', 'Model T', 'Mini', 'Cadillac', 'Thunderbird', 'Corvette', 'Jaguar E-Type', 'DeLorean'],
  },
  history: {
    Leaders: ['Caesar', 'Napoleon', 'Cleopatra', 'Gandhi', 'Churchill', 'Lincoln', 'Alexander', 'Queen Victoria'],
    Events: ['Moon landing', 'Olympics', 'Renaissance', 'Industrial Revolution', 'Gold rush', 'Abolition', 'Reformation', 'Emancipation'],
    Wars: ['World War', 'Civil War', 'Trojan War', 'Cold War', 'Crusades', 'Napoleonic Wars', 'Vietnam War', 'Hundred Years War'],
    Civilisations: ['Rome', 'Egypt', 'Greece', 'Maya', 'Aztec', 'Vikings', 'Mesopotamia', 'Persia'],
  },
};

/**
 * Reference rankings per theme and criterion, best first (already matching the
 * criterion's direction). Blind Ranking draws a subset from these lists and
 * scores players against the same relative order.
 */
export const seedRankings: Record<string, Record<string, string[]>> = {
  food: {
    calories: ['Olive oil', 'Butter', 'Almond', 'Chocolate', 'Cheese', 'Bread', 'Avocado', 'Banana', 'Potato', 'Apple'],
  },
  animals: {
    weight: ['Elephant', 'Giraffe', 'Horse', 'Dolphin', 'Lion', 'Penguin', 'Dog', 'Eagle', 'Snake', 'Cat'],
    speed: ['Lion', 'Horse', 'Giraffe', 'Dolphin', 'Eagle', 'Cat', 'Dog', 'Elephant', 'Penguin', 'Snake'],
  },
  movies: {
    box_office: ['Avatar', 'Avengers: Endgame', 'Titanic', 'Star Wars: The Force Awakens', 'Avengers: Infinity War', 'Jurassic World', 'Frozen II', 'Barbie', 'The Dark Knight', 'Inception'],
    runtime: ['Titanic', 'Avengers: Endgame', 'Avatar', 'The Dark Knight', 'Avengers: Infinity War', 'Inception', 'Star Wars: The Force Awakens', 'Jurassic World', 'Barbie', 'Frozen II'],
  },
  countries: {
    population: ['India', 'China', 'United States', 'Indonesia', 'Pakistan', 'Nigeria', 'Brazil', 'Japan', 'Germany', 'France'],
    area: ['United States', 'China', 'Brazil', 'India', 'Indonesia', 'Nigeria', 'Pakistan', 'France', 'Japan', 'Germany'],
  },
  technology: {
    market_cap: ['Apple', 'Microsoft', 'Google', 'Amazon', 'Tesla', 'Samsung', 'IBM', 'Intel', 'Sony', 'Nokia'],
    founded: ['Nokia', 'IBM', 'Samsung', 'Sony', 'Intel', 'Microsoft', 'Apple', 'Amazon', 'Google', 'Tesla'],
  },
  sports: {
    goals: ['Ronaldo', 'Messi', 'Neymar', 'Mbappé', 'Salah', 'Haaland', 'Zidane', 'Cruyff'],
    matches: ['Carson', 'Pele', 'Federer', 'Dhoni', 'Ronaldo', 'Messi', 'Jordan', 'Bradman'],
  },
  cricket: {
    runs: ['Tendulkar', 'Kohli', 'Root', 'Rohit', 'Warner', 'Williamson', 'Smith', 'Babar'],
    rating: ['Root', 'Smith', 'Williamson', 'Kohli', 'Babar', 'Rohit', 'Warner', 'Head'],
  },
  football: {
    market_value: ['Mbappe', 'Haaland', 'Bellingham', 'Vinicius', 'Kane', 'Saka', 'Salah', 'Messi', 'Ronaldo'],
    goals: ['Ronaldo', 'Messi', 'Neymar', 'Lewandowski', 'Mbappe', 'Salah', 'Haaland', 'Vinicius', 'Zidane'],
  },
  music: {
    monthly_listeners: ['Taylor Swift', 'Billie Eilish', 'Drake', 'Ed Sheeran', 'Bruno Mars', 'Eminem', 'Beyonce', 'Adele'],
    albums: ['Queen', 'Beatles', 'Coldplay', 'ABBA', 'Backstreet Boys', 'Oasis', 'Imagine Dragons', 'Nirvana'],
  },
  science: {
    atomic_number: ['Uranium', 'Gold', 'Iron', 'Neon', 'Oxygen', 'Carbon', 'Helium', 'Hydrogen'],
    discovered: ['Gold', 'Iron', 'Carbon', 'Hydrogen', 'Oxygen', 'Uranium', 'Helium', 'Neon'],
  },
  gaming: {
    copies: ['Minecraft', 'Grand Theft Auto V', 'Wii Sports', 'PUBG', 'Mario Kart 8', 'Red Dead Redemption 2', 'Skyrim', 'The Witcher 3'],
    metacritic: ['Ocarina of Time', 'Breath of the Wild', 'Red Dead Redemption 2', 'Super Mario Galaxy', 'Grand Theft Auto V', 'The Last of Us', 'Skyrim', 'The Witcher 3'],
  },
  cars: {
    horsepower: ['Koenigsegg Jesko', 'Bugatti Chiron', 'Ferrari LaFerrari', 'Pagani Huayra', 'Lamborghini Aventador', 'Lamborghini Huracan', 'McLaren F1', 'Lamborghini Countach'],
    price: ['Bugatti Chiron', 'Koenigsegg Jesko', 'Pagani Huayra', 'Ferrari LaFerrari', 'McLaren F1', 'Lamborghini Aventador', 'Lamborghini Huracan', 'Lamborghini Countach'],
  },
  history: {
    year: ['Trojan War', 'Olympics', 'Renaissance', 'Industrial Revolution', 'French Revolution', 'World War II', 'Cold War', 'Moon landing'],
    duration: ['Roman Empire', 'Crusades', 'Hundred Years War', 'Cold War', 'Vietnam War', 'Napoleonic Wars', 'Trojan War', 'World War II'],
  },
};

/**
 * Auction lots per theme: [name, reference value]. Values sit inside the
 * theme's auctionValueRange and are revealed only in the reveal phase.
 */
export const seedAuctionItems: Record<string, [string, number][]> = {
  food: [
    ['Banana', 1], ['Potato', 2], ['Rice', 3], ['Chicken', 7],
    ['Honey', 14], ['Olive oil', 18], ['Parmesan', 30], ['Lobster', 60],
    ['Wagyu beef', 160], ['Black truffle', 450], ['Saffron', 480], ['Caviar', 400],
  ],
  animals: [
    ['Rat', 10], ['House sparrow', 25], ['Pigeon', 30], ['Goldfish', 40],
    ['Cat', 70], ['Dog', 120], ['Horse', 250], ['Penguin', 600],
    ['Lion', 1500], ['Elephant', 3000], ['Tiger', 4500], ['Blue whale', 5000],
  ],
  movies: [
    ['Napoleon Dynamite', 1], ['Saw', 1], ['Paranormal Activity', 15], ['Joker', 55],
    ['Toy Story', 90], ['Mad Max Fury Road', 150], ['Titanic', 200], ['Avatar', 237],
    ['The Lion King', 260], ['Pirates of the Caribbean', 300], ['Justice League', 300], ['Avengers Endgame', 356],
  ],
  countries: [
    ['Yemen', 600], ['Nepal', 1400], ['Kenya', 2100], ['India', 2700],
    ['Brazil', 11000], ['China', 13000], ['Japan', 34000], ['France', 45000],
    ['Germany', 52000], ['United States', 80000], ['Norway', 87000], ['Switzerland', 100000],
  ],
  technology: [
    ['Echo Dot', 50], ['Kindle', 100], ['Smartwatch', 399], ['Gaming console', 499],
    ['Headphones', 549], ['Tablet', 1099], ['Phone', 1199], ['Monitor', 1499],
    ['Laptop', 2499], ['VR headset', 3499], ['Workstation', 4999], ['Robot kit', 250],
  ],
  sports: [
    ['Local club player', 1], ['Youth prospect', 8], ['Reserve goalkeeper', 15], ['Backup defender', 30],
    ['Regular starter', 60], ['Key player', 100], ['Star player', 160], ['Captain', 200],
    ['World champion', 240], ['Legend of the sport', 250], ['Coaching staff', 40], ['Team kit supplier', 12],
  ],
  cricket: [
    ['Reserve batter', 150], ['Night watchman', 200], ['Spinner', 1100], ['Opening bowler', 1400],
    ['Wicketkeeper', 1500], ['Middle order', 2000], ['All-rounder', 2200], ['Opener', 2800],
    ['Captain', 3600], ['Match winner', 5000], ['Coach', 900], ['Umpire', 120],
  ],
  football: [
    ['Backup keeper', 1], ['Veteran', 3], ['Youth prospect', 10], ['Rotation player', 30],
    ['Rising star', 60], ['Starter', 90], ['Key player', 120], ['Superstar', 180],
    ['Captain', 200], ['Legend', 250], ['Manager', 45], ['Set-piece coach', 12],
  ],
  music: [
    ['Indie artist', 10], ['Cover band', 30], ['Regional star', 100], ['Club DJ', 250],
    ['Songwriter', 600], ['Festival act', 1500], ['Chart act', 2500], ['Arena act', 3500],
    ['Superstar', 4500], ['Legend', 5000], ['Session musician', 90], ['Producer', 400],
  ],
  science: [
    ['Iron', 10], ['Aluminum', 20], ['Copper', 30], ['Silicon', 50],
    ['Lithium', 200], ['Cobalt', 600], ['Silver', 1500], ['Gold', 4000],
    ['Platinum', 7000], ['Helium', 10000], ['Neon', 900], ['Uranium', 8500],
  ],
  gaming: [
    ['Indie game', 15], ['Console game', 60], ['Pro controller', 70], ['Fight stick', 150],
    ['Elite controller', 180], ['Handheld', 200], ['Collector’s edition', 250], ['VR system', 350],
    ['Gaming console', 499], ['Arcade cabinet', 550], ['Gaming PC', 600], ['Streaming rig', 420],
  ],
  cars: [
    ['Used hatchback', 5000], ['Family sedan', 15000], ['Pickup truck', 35000], ['Sports car', 60000],
    ['Convertible', 75000], ['Muscle car', 90000], ['Luxury SUV', 120000], ['GT car', 200000],
    ['Supercar', 400000], ['Vintage classic', 800000], ['Limited edition', 1500000], ['Hypercar', 3000000],
  ],
  history: [
    ['Local legend', 10], ['Merchant', 50], ['Inventor', 200], ['Explorer', 500],
    ['Philosopher', 1000], ['General', 2500], ['Statesman', 3500], ['Queen', 5000],
    ['Emperor', 7000], ['Conqueror', 10000], ['Scribe', 120], ['Diplomat', 800],
  ],
};

export interface SeedEntry {
  category: string;
  word: string;
}

/**
 * Words for a theme filtered by difficulty: lists are authored easiest first,
 * easy draws the first half, hard the second half, medium the whole list.
 */
export function wordsForTheme(themeId: string, difficulty: string): SeedEntry[] {
  const byCategory = seedWords[themeId];
  if (!byCategory) return [];
  const diff: Difficulty = difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'medium';
  const out: SeedEntry[] = [];
  for (const [category, words] of Object.entries(byCategory)) {
    const half = Math.ceil(words.length / 2);
    const slice = diff === 'easy' ? words.slice(0, half) : diff === 'hard' ? words.slice(half) : words;
    for (const word of slice) out.push({ category, word });
  }
  return out;
}

export function categoryWords(themeId: string, category: string, difficulty: string): string[] {
  return wordsForTheme(themeId, difficulty)
    .filter((e) => e.category === category)
    .map((e) => e.word);
}

export function themeCategories(themeId: string): string[] {
  return Object.keys(seedWords[themeId] ?? {});
}

export function rankingFor(themeId: string, criterionId: string): string[] {
  return seedRankings[themeId]?.[criterionId] ?? [];
}

export function auctionLots(themeId: string): { name: string; value: number }[] {
  return (seedAuctionItems[themeId] ?? []).map(([name, value]) => ({ name, value }));
}
