export interface DemoTrack {
  video_id: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  duration_sec: number;
  date_added: string;
  thumbnail_url: string;
  liked: boolean;
  offline: boolean;
  accentColor: string;
}

export interface DemoPlaylist {
  id: string;
  name: string;
  description: string;
  source: 'local' | 'ytm';
  curator: string;
  cover_url: string;
  tracks: string[];
}

export interface DemoAlbum {
  id: string;
  title: string;
  artist: string;
  year: number;
  kind: string;
  cover_url: string;
}

export interface DemoArtist {
  id: string;
  name: string;
  listeners: string;
  verified: boolean;
  avatar_url: string;
}

export interface DemoLyricLine {
  start_time_ms: number;
  end_time_ms: number;
  text: string;
}

function makeCoverSvg(label: string, c1: string, c2: string, circular = false): string {
  const safe = label.replace(/[<>&"']/g, '').slice(0, 14);
  const shape = circular
    ? `<circle cx="100" cy="100" r="92" fill="url(#g)" stroke="#27272A" stroke-width="2"/><circle cx="100" cy="76" r="24" fill="rgba(255,255,255,0.16)"/><path d="M56 152c8-26 24-38 44-38s36 12 44 38" fill="rgba(255,255,255,0.14)"/>`
    : `<rect width="200" height="200" rx="16" fill="url(#g)"/><circle cx="145" cy="56" r="48" fill="${c2}" fill-opacity="0.28"/><circle cx="52" cy="146" r="64" fill="#000" fill-opacity="0.28"/><text x="18" y="176" fill="#FAFAFA" fill-opacity="0.88" font-family="Inter, sans-serif" font-size="16" font-weight="700" letter-spacing="-0.4">${safe}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>${shape}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEMO_TRACKS: DemoTrack[] = [
  {
    video_id: 'resonance-home',
    title: 'Resonance',
    artist: 'HOME',
    album: 'Odyssey',
    year: 2014,
    duration_sec: 222,
    date_added: '3 days ago',
    thumbnail_url: makeCoverSvg('ODYSSEY', '#1E3A8A', '#F43F5E'),
    liked: true,
    offline: true,
    accentColor: '#3B82F6',
  },
  {
    video_id: 'midnight-city-m83',
    title: 'Midnight City',
    artist: 'M83',
    album: "Hurry Up, We're Dreaming",
    year: 2011,
    duration_sec: 244,
    date_added: '5 days ago',
    thumbnail_url: makeCoverSvg('MIDNIGHT', '#312E81', '#EC4899'),
    liked: false,
    offline: true,
    accentColor: '#6366F1',
  },
  {
    video_id: 'coffee-breath-elijah',
    title: 'Coffee Breath',
    artist: 'Elijah Who',
    album: 'Gentle Mornings EP',
    year: 2018,
    duration_sec: 138,
    date_added: '1 week ago',
    thumbnail_url: makeCoverSvg('COFFEE', '#451A03', '#D97706'),
    liked: true,
    offline: false,
    accentColor: '#D97706',
  },
  {
    video_id: 'snowfall-oneheart',
    title: 'Snowfall',
    artist: 'Øneheart, reidenshi',
    album: 'Snowfall Single',
    year: 2022,
    duration_sec: 123,
    date_added: '2 weeks ago',
    thumbnail_url: makeCoverSvg('SNOWFALL', '#0F172A', '#38BDF8'),
    liked: false,
    offline: true,
    accentColor: '#38BDF8',
  },
  {
    video_id: 'daylight-kushner',
    title: 'Daylight',
    artist: 'David Kushner',
    album: 'Daylight Edition',
    year: 2023,
    duration_sec: 212,
    date_added: '2 weeks ago',
    thumbnail_url: makeCoverSvg('DAYLIGHT', '#18181B', '#E11D48'),
    liked: false,
    offline: false,
    accentColor: '#E11D48',
  },
  {
    video_id: 'after-dark-mrkitty',
    title: 'After Dark',
    artist: 'Mr.Kitty',
    album: 'Time',
    year: 2014,
    duration_sec: 258,
    date_added: '3 weeks ago',
    thumbnail_url: makeCoverSvg('AFTER DARK', '#1E1B4B', '#F43F5E'),
    liked: false,
    offline: false,
    accentColor: '#F43F5E',
  },
  {
    video_id: 'space-song-beach-house',
    title: 'Space Song',
    artist: 'Beach House',
    album: 'Depression Cherry',
    year: 2015,
    duration_sec: 320,
    date_added: '1 month ago',
    thumbnail_url: makeCoverSvg('CHERRY', '#4C0519', '#9F1239'),
    liked: false,
    offline: true,
    accentColor: '#9F1239',
  },
  {
    video_id: '33x-perunggu',
    title: '33x',
    artist: 'Perunggu',
    album: 'Memorandum',
    year: 2022,
    duration_sec: 255,
    date_added: '2 days ago',
    thumbnail_url: makeCoverSvg('MEMORANDUM', '#18181B', '#52525B'),
    liked: false,
    offline: true,
    accentColor: '#71717A',
  },
  {
    video_id: 'ini-abadi-perunggu',
    title: 'Ini Abadi',
    artist: 'Perunggu',
    album: 'Memorandum',
    year: 2022,
    duration_sec: 232,
    date_added: '4 days ago',
    thumbnail_url: makeCoverSvg('INI ABADI', '#27272A', '#F43F5E'),
    liked: true,
    offline: false,
    accentColor: '#F43F5E',
  },
  {
    video_id: 'kalibata-2012-perunggu',
    title: 'Kalibata, 2012',
    artist: 'Perunggu',
    album: 'Memorandum',
    year: 2022,
    duration_sec: 288,
    date_added: '1 week ago',
    thumbnail_url: makeCoverSvg('KALIBATA', '#1F2937', '#94A3B8'),
    liked: false,
    offline: false,
    accentColor: '#94A3B8',
  },
  {
    video_id: 'pastikan-riuh-perunggu',
    title: 'Pastikan Riuh Akhiri Malammu',
    artist: 'Perunggu',
    album: 'Memorandum',
    year: 2022,
    duration_sec: 242,
    date_added: '2 weeks ago',
    thumbnail_url: makeCoverSvg('RIUH', '#09090B', '#F59E0B'),
    liked: false,
    offline: false,
    accentColor: '#F59E0B',
  },
];

export const DEMO_PLAYLISTS: DemoPlaylist[] = [
  {
    id: 'late-night-coding',
    name: 'Late Night Coding',
    description: 'Deep focus electronic, ambient, and instrumental tracks for late-night sessions.',
    source: 'ytm',
    curator: 'Nocturne Curated',
    cover_url: makeCoverSvg('LATE NIGHT', '#0F172A', '#14B8A6'),
    tracks: [
      'resonance-home',
      'midnight-city-m83',
      'coffee-breath-elijah',
      'snowfall-oneheart',
      'daylight-kushner',
      'after-dark-mrkitty',
      'space-song-beach-house',
    ],
  },
  {
    id: 'indie-indo-mix',
    name: 'Indie Indo Mix',
    description: 'Kurasi rock alternatif dan indie Indonesia pilihan untuk sesi santai.',
    source: 'ytm',
    curator: 'YouTube Music Synced',
    cover_url: makeCoverSvg('INDIE INDO', '#27272A', '#F43F5E'),
    tracks: ['33x-perunggu', 'ini-abadi-perunggu', 'kalibata-2012-perunggu', 'pastikan-riuh-perunggu'],
  },
  {
    id: 'focus-flow',
    name: 'Focus Flow',
    description: 'Playlist lokal bebas gangguan tersimpan di SQLite.',
    source: 'local',
    curator: 'Local SQLite',
    cover_url: makeCoverSvg('FOCUS FLOW', '#1E1B4B', '#3B82F6'),
    tracks: ['resonance-home', 'snowfall-oneheart', 'coffee-breath-elijah'],
  },
  {
    id: 'workout-energy',
    name: 'Workout Energy',
    description: 'Synthwave dan beat cepat untuk ritme latihan.',
    source: 'local',
    curator: 'Local SQLite',
    cover_url: makeCoverSvg('ENERGY', '#4C0519', '#FB7185'),
    tracks: ['midnight-city-m83', 'after-dark-mrkitty'],
  },
  {
    id: 'deep-lofi-chill',
    name: 'Deep Lo-Fi Chill',
    description: 'Koleksi lo-fi dan ambient lokal untuk malam tenang.',
    source: 'local',
    curator: 'Local SQLite',
    cover_url: makeCoverSvg('LO-FI CHILL', '#18181B', '#0EA5E9'),
    tracks: ['coffee-breath-elijah', 'snowfall-oneheart', 'space-song-beach-house'],
  },
];

export const FEATURED_BANNER_COVER = makeCoverSvg('CHILL CODING', '#0F172A', '#3B82F6');

export const DEMO_ALBUMS: DemoAlbum[] = [
  {
    id: 'memorandum',
    title: 'Memorandum',
    artist: 'Perunggu',
    year: 2022,
    kind: 'Album',
    cover_url: makeCoverSvg('MEMORANDUM', '#18181B', '#52525B'),
  },
  {
    id: 'pendar',
    title: 'Pendar',
    artist: 'Perunggu',
    year: 2023,
    kind: 'EP',
    cover_url: makeCoverSvg('PENDAR', '#292524', '#F59E0B'),
  },
  {
    id: 'biang',
    title: 'Biang',
    artist: 'Perunggu',
    year: 2020,
    kind: 'Single',
    cover_url: makeCoverSvg('BIANG', '#09090B', '#D4D4D8'),
  },
  {
    id: 'menyala',
    title: 'Menyala',
    artist: 'Perunggu',
    year: 2021,
    kind: 'Single',
    cover_url: makeCoverSvg('MENYALA', '#1C1917', '#EA580C'),
  },
];

export const DEMO_ARTISTS: DemoArtist[] = [
  {
    id: 'perunggu',
    name: 'Perunggu',
    listeners: '1.2M monthly listeners',
    verified: true,
    avatar_url: makeCoverSvg('Perunggu', '#27272A', '#71717A', true),
  },
  {
    id: 'lomba-sihir',
    name: 'Lomba Sihir',
    listeners: '980K monthly listeners',
    verified: true,
    avatar_url: makeCoverSvg('Lomba Sihir', '#1E293B', '#38BDF8', true),
  },
  {
    id: 'hindia',
    name: 'Hindia',
    listeners: '3.4M monthly listeners',
    verified: true,
    avatar_url: makeCoverSvg('Hindia', '#18181B', '#F43F5E', true),
  },
  {
    id: 'feast',
    name: '.Feast',
    listeners: '2.1M monthly listeners',
    verified: true,
    avatar_url: makeCoverSvg('.Feast', '#312E81', '#F59E0B', true),
  },
];

export const DEMO_ZEN_LYRICS: DemoLyricLine[] = [
  {
    start_time_ms: 68_000,
    end_time_ms: 75_000,
    text: '...and the neon fades into the quiet mist',
  },
  {
    start_time_ms: 75_000,
    end_time_ms: 82_000,
    text: 'Echoes of a distant melody wandering through the dark',
  },
  {
    start_time_ms: 82_000,
    end_time_ms: 91_000,
    text: 'Memory drifting like light through an open window',
  },
  {
    start_time_ms: 91_000,
    end_time_ms: 99_000,
    text: 'Hold on to the frequency before the morning comes',
  },
  {
    start_time_ms: 99_000,
    end_time_ms: 106_000,
    text: 'Where midnight never really ends',
  },
  {
    start_time_ms: 106_000,
    end_time_ms: 114_000,
    text: 'Just loops into a softer dream',
  },
];

export function formatTimeSec(sec: number): string {
  const clamped = Math.max(0, Math.floor(sec));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
