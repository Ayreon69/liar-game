// Les bots : ils parlent, proposent des pactes, mentent. Ils n'ont accès à aucun bulletin, seulement à ce qui se dit.
import type { Side } from '../shared/protocol';

export interface Personality {
  /** Chance de tenir un pacte accepté. */
  loyalty: number;
  /** Chance de prendre le contre-pied de ce qu'il entend. */
  contrarian: number;
  /** Chance de dire ce qu'il compte vraiment faire. */
  honesty: number;
  /** Goût pour les pactes secrets. */
  schemer: number;
}

export function randomPersonality(): Personality {
  return {
    loyalty: 0.3 + Math.random() * 0.6,
    contrarian: 0.45 + Math.random() * 0.45,
    honesty: 0.15 + Math.random() * 0.6,
    schemer: 0.3 + Math.random() * 0.6,
  };
}

/** Ce qu'un bot a le droit de savoir : ce qui a été dit publiquement, et ses propres pactes. */
export interface BotView {
  personality: Personality;
  /** La dernière consigne publique de chaque joueur (hors lui-même). */
  claims: Side[];
  /** Les camps promis dans ses pactes acceptés. */
  promises: Side[];
}

export function otherSide(s: Side): Side {
  return s === 'A' ? 'B' : 'A';
}

export function randomSide(): Side {
  return Math.random() < 0.5 ? 'A' : 'B';
}

/** Repère une consigne de vote dans un message : « je vote A », « votez B », « A » tout seul. */
export function parseClaim(text: string): Side | null {
  const t = text.trim();
  const alone = t.match(/^([ABab])[\s.!?]*$/);
  if (alone) return alone[1].toUpperCase() as Side;
  const m = t.match(/\b(?:vot\w*|pren\w*|choisi\w*|mets?|mettez|tous\s+sur|sur\s+le)\b[^.!?]*?\b([ABab])\b/i);
  return m ? (m[1].toUpperCase() as Side) : null;
}

/**
 * Le choix du bot : tenir un pacte selon sa loyauté, sinon viser le camp dont on parle le moins.
 * Si tout le monde dit la même chose, il s'en méfie assez pour parfois suivre quand même.
 */
export function botVote(v: BotView): Side {
  if (v.promises.length && Math.random() < v.personality.loyalty) return v.promises[Math.floor(Math.random() * v.promises.length)];
  const a = v.claims.filter((c) => c === 'A').length;
  const b = v.claims.length - a;
  if (a === b) return randomSide();
  const quiet: Side = a < b ? 'A' : 'B';
  return Math.random() < v.personality.contrarian ? quiet : otherSide(quiet);
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function publicLine(side: Side): string {
  return pick([
    `Je vote ${side}.`,
    `Votez ${side}, faites-moi confiance.`,
    `Moi je prends le ${side}, et je ne m'en cache pas.`,
    `Tous sur le ${side} ? Ça peut marcher.`,
    `Si on se répartit bien, je prends le ${side}.`,
    `Je vote ${side}. Et vous, vous dites quoi ?`,
  ]);
}

export function teaseLine(): string {
  return pick([
    "Quelqu'un ment déjà, je le sens.",
    'Vous êtes bien silencieux…',
    'Ne croyez pas ce qui se dit ici.',
    'Qui chuchote à qui ? Moi, je regarde.',
    'Je ne dirai rien. Pas à vous tous.',
    'La majorité, ce sera vous. Pas moi.',
    "C'est drôle, tout le monde a l'air sincère.",
    'Comptez bien vos amis.',
  ]);
}

export function whisperLine(side: Side): string {
  return pick([
    `Entre nous : prends le ${side}. Ne le dis à personne.`,
    `Je ne fais confiance qu'à toi. Moi, c'est ${side}.`,
    `Ils vont tous sur l'autre. Viens sur le ${side}.`,
    `Psst. ${side}. Garde ça pour toi.`,
  ]);
}

export function replyLine(claim: Side | null): string {
  if (claim) return pick([`D'accord pour le ${claim}.`, `${claim} ? Si tu le dis…`, `Ça me va, ${claim}.`, `Pourquoi le ${claim} ? Bon. Compte sur moi.`]);
  return pick(['Je t’écoute.', 'Tu dis ça à tout le monde ?', 'Ne parle pas si fort.', 'Dis-moi plutôt ce que tu votes.', 'Hmm.']);
}
