// Une table de Liar Game : salon, discussion, chuchotements, pactes, isoloir, dépouillement et classement.
import crypto from 'node:crypto';
import {
  AVATARS,
  FINAL_SURVIVORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_BASE_MS,
  REVEAL_PACT_MS,
  REVEAL_STEP_MS,
  REVEAL_VERDICT_MS,
  TALK_OPTIONS,
  TAUNTS,
  VOTE_SECONDS,
  verdict,
  type Ballot,
  type FinalEntry,
  type LogEntry,
  type LogKind,
  type MinuteEntry,
  type Pact,
  type PactResult,
  type PlayerStats,
  type PlayerStatus,
  type Question,
  type Reveal,
  type RoomView,
  type RoundPhase,
  type Settings,
  type Side,
  type TalkTime,
  type Whisper,
} from '../shared/protocol';
import { botVote, otherSide, parseClaim, publicLine, randomPersonality, randomSide, replyLine, teaseLine, whisperLine, type Personality } from './bots';
import { QUESTIONS } from './questions';

const BOT_NAMES = ['Sœur Agathe', 'Le Notaire', 'Mlle Vesper', 'Octave', 'Le Comptable', 'Irène', 'Maître Lune', 'Basile', 'La Veuve', 'Anselme', 'Numéro 7', 'Colombe', 'Le Greffier', 'Ophélie', 'Tristan'];
const MAX_MEMBERS = 24;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (LM_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.LM_FAST === '1';
const VOTE_MS = FAST ? 500 : VOTE_SECONDS * 1000;
const REVEAL_MS = FAST ? 200 : 12_000;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  personality: Personality;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
  rank: number | null;
  outRound: number | null;
  stats: PlayerStats;
}

interface BotEvent {
  at: number;
  botId: string;
  kind: 'speak' | 'reply' | 'answerPact';
  /** Pour une réponse : à qui, et ce qu'il a entendu. */
  to?: string;
  claim?: Side | null;
  pactId?: number;
}

export interface Round {
  number: number;
  phase: RoundPhase;
  question: Question;
  order: string[];
  endsAt: number;
  votes: Map<string, Side>;
  sealed: Set<string>;
  ready: Set<string>;
  pacts: Pact[];
  whispers: Whisper[];
  /** La dernière consigne publique de chacun : ce que les bots peuvent entendre. */
  claims: Map<string, Side>;
  botEvents: BotEvent[];
  botVoteAt: Map<string, number>;
  reveal: Reveal | null;
  revealMinAt: number;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyStats(): PlayerStats {
  return { betrayals: 0, kept: 0, betrayed: 0, whispers: 0, messages: 0, smallestMinority: 0 };
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { talk: 60 };
  players: Player[] = [];
  round: Round | null = null;
  final: FinalEntry[] | null = null;
  minutes: MinuteEntry[] | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};
  /** Tout le monde voit qu'on chuchote, personne ne lit quoi. */
  onWhisper: (from: string, to: string) => void = () => {};

  private log: LogEntry[] = [];
  private logId = 0;
  private roundCount = 0;
  private itemId = 0;
  private deck: Question[] = [];
  private record: MinuteEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  /** Dans l'isoloir, plus personne ne parle. */
  get silent(): boolean {
    return this.phase === 'playing' && this.round?.phase === 'vote';
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      personality: randomPersonality(),
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: 0,
      left: false,
      status,
      rank: null,
      outRound: null,
      stats: emptyStats(),
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const seatFree = this.phase === 'lobby' && this.seated.length < MAX_PLAYERS;
    if (this.phase === 'lobby' && !seatFree) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, seatFree ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.addLog('system', p.status === 'spectator' ? `${p.name} observe la séance.` : `${p.name} rejoint la table.`);
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    const bot = this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby');
    this.players.push(bot);
    this.addLog('system', `${bot.name} (bot) rejoint la table.`);
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    this.addLog('system', `${p.name} a été retiré de la table.`);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (this.phase === 'lobby' || p.status === 'spectator') {
      this.players = this.players.filter((x) => x.id !== id);
      this.addLog('system', `${p.name} a quitté la table.`);
    } else {
      p.left = true;
      if (p.status === 'playing') this.addLog('system', `${p.name} a quitté la partie : le pilote automatique vote à sa place.`);
      else this.addLog('system', `${p.name} a quitté la table.`);
    }
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
    if (next) this.addLog('system', `${next.name} devient l'hôte de la table.`);
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    if (p.left) {
      p.left = false;
      this.addLog('system', `${p.name} est de retour.`);
    }
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if ((TALK_OPTIONS as readonly unknown[]).includes(payload.talk)) this.settings.talk = payload.talk as TalkTime;
    return undefined;
  }

  // ───────────────────────────── Journal et parole ─────────────────────────────

  addLog(kind: LogKind, text: string, playerId?: string): void {
    this.log.push({ id: ++this.logId, at: Date.now(), kind, text, playerId });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
  }

  chat(id: string, text: string): string | undefined {
    const p = this.get(id);
    if (!p) return 'Joueur introuvable.';
    if (this.silent) return "Silence dans l'isoloir.";
    this.addLog('chat', `${p.name} : ${text}`, p.id);
    p.stats.messages++;
    const r = this.round;
    if (r?.phase === 'talk' && p.status === 'playing') {
      const claim = parseClaim(text);
      if (claim) r.claims.set(id, claim);
    }
    return undefined;
  }

  whisper(id: string, to: unknown, text: string): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'talk') return "On ne chuchote que pendant la discussion.";
    const from = this.get(id);
    const target = this.get(typeof to === 'string' ? to : undefined);
    if (from?.status !== 'playing') return 'Seuls les joueurs en lice peuvent chuchoter.';
    if (!target || target.status !== 'playing' || target.id === id) return 'Ce joueur ne peut pas recevoir ton message.';
    r.whispers.push({ id: ++this.itemId, at: Date.now(), from: id, to: target.id, text });
    from.stats.whispers++;
    this.onWhisper(id, target.id);
    if (target.isBot && !from.isBot) {
      r.botEvents.push({ at: Date.now() + (FAST ? 10 : 1200 + Math.random() * 2500), botId: target.id, kind: 'reply', to: id, claim: parseClaim(text) });
    }
    return undefined;
  }

  proposePact(id: string, to: unknown, side: unknown): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'talk') return 'Les pactes se signent pendant la discussion.';
    if (side !== 'A' && side !== 'B') return 'Choisis un camp.';
    const from = this.get(id);
    const target = this.get(typeof to === 'string' ? to : undefined);
    if (from?.status !== 'playing') return 'Seuls les joueurs en lice peuvent signer un pacte.';
    if (!target || target.status !== 'playing' || target.id === id) return 'Ce joueur ne peut pas signer avec toi.';
    const open = r.pacts.find((x) => x.status !== 'refused' && ((x.from === id && x.to === target.id) || (x.from === target.id && x.to === id)));
    if (open) return open.status === 'pending' ? 'Une proposition est déjà sur la table avec ce joueur.' : 'Vous avez déjà un pacte pour cette manche.';
    const pact: Pact = { id: ++this.itemId, from: id, to: target.id, side, status: 'pending' };
    r.pacts.push(pact);
    this.onWhisper(id, target.id);
    if (target.isBot) r.botEvents.push({ at: Date.now() + (FAST ? 10 : 1000 + Math.random() * 2500), botId: target.id, kind: 'answerPact', pactId: pact.id });
    return undefined;
  }

  answerPact(id: string, pactId: unknown, accept: unknown): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'talk') return 'Trop tard pour répondre.';
    const pact = r.pacts.find((x) => x.id === pactId);
    if (!pact || pact.to !== id) return 'Proposition introuvable.';
    if (pact.status !== 'pending') return 'Tu as déjà répondu.';
    pact.status = accept === true ? 'accepted' : 'refused';
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute des bots si besoin).`;
    for (const p of seated) {
      p.status = 'playing';
      p.rank = null;
      p.outRound = null;
      p.stats = emptyStats();
      if (p.isBot) p.personality = randomPersonality();
    }
    this.phase = 'playing';
    this.roundCount = 0;
    this.record = [];
    this.final = null;
    this.minutes = null;
    this.deck = shuffle([...QUESTIONS]);
    this.log = [];
    this.addLog('system', `La séance est ouverte : ${seated.length} joueurs. Seule la minorité survit.`);
    this.startRound();
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
      p.rank = null;
      p.outRound = null;
    }
    this.phase = 'lobby';
    this.round = null;
    this.final = null;
    this.minutes = null;
    this.addLog('system', 'Retour au salon : nouvelle partie en préparation.');
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    this.addLog('system', "L'hôte a levé la séance.");
    return this.restart(by);
  }

  private playing(): Player[] {
    return this.players.filter((p) => p.status === 'playing');
  }

  /** Plus aucun humain en lice : les bots finissent vite pour ne pas faire attendre les recalés. */
  private onlyBotsLeft(): boolean {
    return this.playing().every((p) => p.isBot || p.left);
  }

  private nextQuestion(): Question {
    if (!this.deck.length) this.deck = shuffle([...QUESTIONS]);
    return this.deck.pop()!;
  }

  private startRound(): void {
    const alive = this.playing();
    const now = Date.now();
    const quick = this.onlyBotsLeft();
    const talkMs = FAST ? 120 : quick ? 1_800 : this.settings.talk * 1000;
    const r: Round = {
      number: ++this.roundCount,
      phase: 'talk',
      question: this.nextQuestion(),
      order: alive.map((p) => p.id),
      endsAt: now + talkMs,
      votes: new Map(),
      sealed: new Set(),
      ready: new Set(),
      pacts: [],
      whispers: [],
      claims: new Map(),
      botEvents: [],
      botVoteAt: new Map(),
      reveal: null,
      revealMinAt: 0,
    };
    // Chaque bot prend la parole une ou deux fois, réparties dans la discussion.
    if (!quick) {
      for (const p of alive) {
        if (!p.isBot) continue;
        const times = FAST ? 1 : 1 + crypto.randomInt(2);
        for (let i = 0; i < times; i++) r.botEvents.push({ at: now + (FAST ? 20 : 2500 + Math.random() * Math.min(talkMs - 6000, 40_000)), botId: p.id, kind: 'speak' });
      }
    }
    this.round = r;
    this.addLog('round', `Manche ${r.number} : ${alive.length} joueurs en lice.`);
  }

  /** Abréger la discussion : quand tous ceux qui jouent l'ont demandé, on passe au vote. */
  readyTalk(id: string): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'talk') return undefined;
    if (this.get(id)?.status !== 'playing') return undefined;
    if (r.ready.has(id)) r.ready.delete(id);
    else r.ready.add(id);
    if (this.needed(r).every((p) => r.ready.has(p.id))) this.openBooth(r);
    return undefined;
  }

  private needed(r: Round): Player[] {
    return r.order.map((id) => this.get(id)!).filter((p) => p && !p.isBot && !this.isAuto(p) && p.connected);
  }

  /** Le rideau tombe : plus un mot, chacun vote seul. */
  private openBooth(r: Round): void {
    const now = Date.now();
    r.phase = 'vote';
    r.endsAt = now + (this.onlyBotsLeft() ? (FAST ? 40 : 700) : VOTE_MS);
    r.botEvents = [];
    r.ready.clear();
    // Les propositions sans réponse tombent à l'eau.
    for (const pact of r.pacts) if (pact.status === 'pending') pact.status = 'refused';
    for (const id of r.order) {
      const p = this.get(id);
      if (p?.isBot) r.botVoteAt.set(id, now + (FAST ? 10 : this.onlyBotsLeft() ? 100 : 1500 + Math.random() * (VOTE_MS - 4000)));
    }
  }

  vote(id: string, side: unknown): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'vote') return "L'isoloir est fermé.";
    if (side !== 'A' && side !== 'B') return 'Bulletin invalide.';
    if (!r.order.includes(id)) return 'Tu ne votes pas à cette manche.';
    if (r.sealed.has(id)) return 'Ton bulletin est déjà scellé.';
    r.votes.set(id, side);
    return undefined;
  }

  /** Sceller : le bulletin ne bouge plus. Quand tous sont scellés, on dépouille sans attendre. */
  seal(id: string): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'vote') return "L'isoloir est fermé.";
    if (!r.order.includes(id)) return 'Tu ne votes pas à cette manche.';
    if (!r.votes.has(id)) return "Choisis d'abord un camp.";
    r.sealed.add(id);
    if (r.order.every((x) => r.sealed.has(x))) this.count(r);
    return undefined;
  }

  private botChoice(r: Round, p: Player): Side {
    const claims: Side[] = [];
    for (const [who, c] of r.claims) if (who !== p.id) claims.push(c);
    const promises = r.pacts.filter((x) => x.status === 'accepted' && (x.from === p.id || x.to === p.id)).map((x) => x.side);
    return botVote({ personality: p.personality, claims, promises });
  }

  /** Dépouillement : personne n'a plus la main, on ne fait qu'ouvrir les bulletins. */
  private count(r: Round): void {
    // Qui n'a pas voté à temps tire au sort : un absent ne doit pas bloquer la table.
    for (const id of r.order) {
      const p = this.get(id)!;
      if (!r.votes.has(id)) r.votes.set(id, p.isBot || p.left ? this.botChoice(r, p) : randomSide());
    }
    const ballots: Ballot[] = shuffle(r.order.map((id) => ({ id, side: r.votes.get(id)! })));
    const { outcome, minority } = verdict(ballots);

    const pacts: PactResult[] = r.pacts
      .filter((x) => x.status === 'accepted')
      .map((x) => {
        const traitors = [x.from, x.to].filter((id) => r.votes.get(id) !== x.side);
        for (const id of [x.from, x.to]) {
          const p = this.get(id);
          if (!p) continue;
          if (traitors.includes(id)) p.stats.betrayals++;
          else p.stats.kept++;
        }
        for (const t of traitors) {
          const victim = this.get(t === x.from ? x.to : x.from);
          if (victim && !traitors.includes(victim.id)) victim.stats.betrayed++;
        }
        return { from: x.from, to: x.to, side: x.side, traitors };
      });

    const eliminated: string[] = [];
    if (minority) {
      const size = ballots.filter((b) => b.side === minority).length;
      for (const b of ballots) {
        const p = this.get(b.id)!;
        if (b.side === minority) {
          p.stats.smallestMinority = p.stats.smallestMinority ? Math.min(p.stats.smallestMinority, size) : size;
        } else {
          p.status = 'eliminated';
          p.outRound = r.number;
          eliminated.push(p.id);
        }
      }
      const names = eliminated.map((id) => this.get(id)!.name).join(', ');
      this.addLog('eliminate', `Manche ${r.number} : ${names} ${eliminated.length > 1 ? 'tombent' : 'tombe'}.`);
    } else {
      this.addLog('round', `Manche ${r.number} : pas de minorité, personne ne tombe. On revote.`);
    }

    const finished = this.playing().length <= FINAL_SURVIVORS;
    this.record.push({ number: r.number, question: r.question, ballots, outcome, minority });

    const now = Date.now();
    r.phase = 'reveal';
    r.reveal = { ballots, outcome, minority, eliminated, pacts, finished };
    // Personne ne doit pouvoir couper ce moment.
    r.revealMinAt = FAST ? now : now + REVEAL_BASE_MS + ballots.length * REVEAL_STEP_MS + REVEAL_VERDICT_MS + pacts.length * REVEAL_PACT_MS;
    r.endsAt = FAST ? now + REVEAL_MS : r.revealMinAt + (this.onlyBotsLeft() ? 900 : REVEAL_MS);
    r.ready.clear();
  }

  readyNext(id: string): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'reveal') return undefined;
    r.ready.add(id);
    const needed = this.players.filter((p) => !p.isBot && !this.isAuto(p) && p.connected && p.status !== 'spectator');
    if (needed.every((p) => r.ready.has(p.id))) {
      // Tout le monde est prêt : on abrège l'attente, sans couper le dépouillement.
      if (Date.now() >= r.revealMinAt) this.afterRound();
      else r.endsAt = r.revealMinAt;
    }
    return undefined;
  }

  afterRound(): void {
    const r = this.round;
    if (!r?.reveal) return;
    if (r.reveal.finished) this.finishGame();
    else this.startRound();
  }

  private finishGame(): void {
    const survivors = this.playing();
    const out = this.players.filter((p) => p.status === 'eliminated').sort((a, b) => (b.outRound ?? 0) - (a.outRound ?? 0));
    for (const p of survivors) p.rank = 1;
    // Ceux qui tombent à la même manche partagent le même rang.
    let seen = survivors.length;
    let prev: number | null = null;
    let rank = 0;
    for (const p of out) {
      if (p.outRound !== prev) {
        rank = seen + 1;
        prev = p.outRound;
      }
      p.rank = rank;
      seen++;
    }
    const names = survivors.map((p) => p.name).join(' et ');
    this.addLog('win', `${names} ${survivors.length > 1 ? 'survivent' : 'survit'} à la séance.`);
    this.final = [...survivors, ...out].map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, rank: p.rank!, survivor: p.outRound === null, outRound: p.outRound, stats: { ...p.stats } }));
    this.minutes = this.record;
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Bots ─────────────────────────────

  private runBotEvent(r: Round, e: BotEvent): void {
    const bot = this.get(e.botId);
    if (!bot || bot.status !== 'playing') return;
    if (e.kind === 'answerPact') {
      const pact = r.pacts.find((x) => x.id === e.pactId);
      if (pact?.status === 'pending') {
        pact.status = Math.random() < 0.72 ? 'accepted' : 'refused';
        const proposer = this.get(pact.from);
        if (proposer && !proposer.isBot && Math.random() < 0.5) {
          this.whisper(bot.id, proposer.id, pact.status === 'accepted' ? `Marché conclu : ${pact.side}.` : 'Non. Je ne signe pas avec toi.');
        }
      }
      return;
    }
    if (e.kind === 'reply') {
      if (e.to) this.whisper(bot.id, e.to, replyLine(e.claim ?? null));
      return;
    }
    const others = r.order.filter((id) => id !== bot.id);
    const humans = others.filter((id) => !this.get(id)?.isBot);
    const honest = bot.personality.honesty;
    // Ce qu'il dira n'a pas forcément de rapport avec ce qu'il votera.
    const said: Side = Math.random() < honest ? this.botChoice(r, bot) : otherSide(this.botChoice(r, bot));
    const roll = Math.random();
    if (roll < bot.personality.schemer * 0.55 && others.length) {
      // Il préfère circonvenir un humain : c'est là que la partie se joue.
      const pool = humans.length && Math.random() < 0.75 ? humans : others;
      const target = pool[crypto.randomInt(pool.length)];
      if (Math.random() < 0.55) this.whisper(bot.id, target, whisperLine(said));
      // Deux propositions de bots par manche suffisent : au-delà, un humain ne lit plus rien.
      const courted = r.pacts.filter((x) => x.to === target && this.get(x.from)?.isBot).length;
      if (this.get(target)?.isBot || courted < 2) this.proposePact(bot.id, target, said);
    } else if (roll < 0.72) {
      this.chat(bot.id, publicLine(said));
      if (!FAST && Math.random() < 0.1) this.onEmote(bot.id, TAUNTS[crypto.randomInt(TAUNTS.length)]);
    } else if (Math.random() < 0.5 && others.length) {
      const target = others[crypto.randomInt(others.length)];
      this.whisper(bot.id, target, whisperLine(said));
    } else {
      this.chat(bot.id, teaseLine());
    }
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  private at(ms: number, fn: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fn();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(ms, 2_147_000_000)));
  }

  private reschedule(): void {
    this.clearTimer();
    if (this.phase !== 'playing') return;
    const now = Date.now();
    const r = this.round;
    if (!r) return;
    let due = r.endsAt;
    if (r.phase === 'talk') for (const e of r.botEvents) due = Math.min(due, e.at);
    if (r.phase === 'vote') for (const [id, t] of r.botVoteAt) if (!r.sealed.has(id)) due = Math.min(due, t);
    this.at(due - now, () => this.tick(r));
  }

  private tick(r: Round): void {
    if (this.round !== r) return;
    const now = Date.now();
    if (r.phase === 'talk') {
      const due = r.botEvents.filter((e) => e.at <= now);
      r.botEvents = r.botEvents.filter((e) => e.at > now);
      for (const e of due) this.runBotEvent(r, e);
      if (now >= r.endsAt && r.phase === 'talk') this.openBooth(r);
      return;
    }
    if (r.phase === 'vote') {
      for (const [id, t] of r.botVoteAt) {
        if (t > now || r.sealed.has(id) || r.phase !== 'vote') continue;
        const p = this.get(id)!;
        r.votes.set(id, this.botChoice(r, p));
        this.seal(id);
      }
      if (r.phase === 'vote' && now >= r.endsAt) this.count(r);
      return;
    }
    if (now >= r.endsAt) this.afterRound();
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  viewFor(viewerId: string): RoomView {
    const r = this.round;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
        rank: p.rank,
      })),
      round: r
        ? {
            number: r.number,
            phase: r.phase,
            question: r.question,
            order: [...r.order],
            endsAt: r.endsAt,
            // Le cœur du jeu : un bulletin ne sort du serveur que vers son auteur, jusqu'au dépouillement.
            mine: r.votes.get(viewerId) ?? null,
            sealed: r.sealed.has(viewerId),
            sealedIds: [...r.sealed],
            readyIds: [...r.ready],
            // Pactes et chuchotements ne regardent que leurs deux participants.
            pacts: r.pacts.filter((x) => x.from === viewerId || x.to === viewerId).map((x) => ({ ...x })),
            whispers: r.whispers.filter((w) => w.from === viewerId || w.to === viewerId),
            reveal: r.reveal,
            revealMinAt: r.revealMinAt,
          }
        : null,
      log: this.log.slice(-80),
      final: this.final,
      minutes: this.minutes,
      serverNow: Date.now(),
    };
  }
}
