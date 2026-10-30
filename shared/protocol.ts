// Contrat partagé entre le serveur et le client : vues de table, réglages, constantes, règle du vote.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;
/** À deux, personne ne peut être en minorité : la partie s'arrête là. */
export const FINAL_SURVIVORS = 2;

export const SIDES = ['A', 'B'] as const;
export type Side = (typeof SIDES)[number];

/** Les douze masques du jeu (dessinés dans components/Mask.tsx). */
export const AVATARS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'] as const;
export const EMOTES = ['😏', '🤫', '🐍', '🤝', '👀', '😱', '🤡', '🔥'] as const;
export const TAUNTS = ['Fais-moi confiance.', 'Je ne mens jamais.', 'Tu es sûr de toi ?', 'Ils te mentent.', 'Rien de personnel.', 'Bien essayé.'] as const;

export const TALK_OPTIONS = [30, 60, 90, 120] as const;
export type TalkTime = (typeof TALK_OPTIONS)[number];
/** Le temps passé seul dans l'isoloir. */
export const VOTE_SECONDS = 15;

export const MAX_MESSAGE = 160;

/** Le dépouillement : le rideau, un bulletin à la fois, le tampon, puis chaque pacte. */
export const REVEAL_BASE_MS = 2_800;
export const REVEAL_STEP_MS = 560;
export const REVEAL_VERDICT_MS = 2_200;
export const REVEAL_PACT_MS = 1_100;

export interface Settings {
  /** Durée de la discussion avant chaque vote, en secondes. */
  talk: TalkTime;
}

export type PlayerStatus = 'lobby' | 'playing' | 'eliminated' | 'spectator';
/** talk : on négocie. vote : isoloir, silence total. reveal : on ouvre les bulletins. */
export type RoundPhase = 'talk' | 'vote' | 'reveal';

export interface Question {
  text: string;
  a: string;
  b: string;
}

export interface PlayerStats {
  /** Pactes acceptés puis trahis par ce joueur. */
  betrayals: number;
  /** Pactes tenus par ce joueur. */
  kept: number;
  /** Fois où ce joueur a été trahi. */
  betrayed: number;
  whispers: number;
  messages: number;
  /** Le plus petit camp dans lequel ce joueur a survécu. */
  smallestMinority: number;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  rank: number | null;
}

export interface Ballot {
  id: string;
  side: Side;
}

export interface PactResult {
  from: string;
  to: string;
  side: Side;
  /** Ceux qui n'ont pas voté comme promis. */
  traitors: string[];
}

/** minority : un camp plus petit survit. tie : égalité. unanimous : tout le monde du même côté. */
export type Outcome = 'minority' | 'tie' | 'unanimous';

export interface Reveal {
  /** Les bulletins, dans l'ordre où on les dépouille (mélangé). */
  ballots: Ballot[];
  outcome: Outcome;
  minority: Side | null;
  eliminated: string[];
  pacts: PactResult[];
  finished: boolean;
}

export type PactStatus = 'pending' | 'accepted' | 'refused';

/** Un pacte ne se voit que de ses deux signataires, jusqu'au dépouillement. */
export interface Pact {
  id: number;
  from: string;
  to: string;
  side: Side;
  status: PactStatus;
}

export interface Whisper {
  id: number;
  at: number;
  from: string;
  to: string;
  text: string;
}

export interface RoundView {
  number: number;
  phase: RoundPhase;
  question: Question;
  /** Les joueurs encore en lice au début de la manche. */
  order: string[];
  endsAt: number;
  /** Ton vote, à toi seul. */
  mine: Side | null;
  sealed: boolean;
  /** Qui a scellé son bulletin : ça se voit, pas ce qu'il contient. */
  sealedIds: string[];
  /** Qui veut abréger la discussion. */
  readyIds: string[];
  /** Tes pactes, à toi seul. */
  pacts: Pact[];
  /** Tes chuchotements de la manche en cours, à toi seul. */
  whispers: Whisper[];
  reveal: Reveal | null;
  /** Date à partir de laquelle on peut passer à la suite : le dépouillement doit avoir eu lieu. */
  revealMinAt: number;
}

export type LogKind = 'system' | 'round' | 'eliminate' | 'win' | 'chat';
export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  text: string;
  playerId?: string;
}

export interface FinalEntry {
  id: string;
  name: string;
  avatar: string;
  rank: number;
  survivor: boolean;
  /** Manche où le joueur est tombé (null s'il a survécu). */
  outRound: number | null;
  stats: PlayerStats;
}

/** Le procès-verbal, publié seulement quand la partie est finie. */
export interface MinuteEntry {
  number: number;
  question: Question;
  ballots: Ballot[];
  outcome: Outcome;
  minority: Side | null;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  round: RoundView | null;
  log: LogEntry[];
  final: FinalEntry[] | null;
  minutes: MinuteEntry[] | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/**
 * Le verdict d'un vote : seul le camp le moins nombreux survit.
 * Égalité ou unanimité : il n'y a pas de minorité, personne ne tombe et on revote.
 */
export function verdict(ballots: Ballot[]): { outcome: Outcome; minority: Side | null } {
  const a = ballots.filter((b) => b.side === 'A').length;
  const b = ballots.length - a;
  if (a === 0 || b === 0) return { outcome: 'unanimous', minority: null };
  if (a === b) return { outcome: 'tie', minority: null };
  return { outcome: 'minority', minority: a < b ? 'A' : 'B' };
}
