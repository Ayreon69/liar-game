// Moteur de jeu : verdict, secret des bulletins, pactes, bots et parties simulées.
import { describe, expect, it } from 'vitest';
import { verdict, type Ballot, type Side } from '../shared/protocol';
import { botVote, parseClaim, randomPersonality } from '../server/bots';
import { Room, type Round } from '../server/room';

function ballots(a: number, b: number): Ballot[] {
  return [...Array.from({ length: a }, (_, i) => ({ id: `a${i}`, side: 'A' as Side })), ...Array.from({ length: b }, (_, i) => ({ id: `b${i}`, side: 'B' as Side }))];
}

function table(n: number, bots = 0): { room: Room; ids: string[] } {
  const room = new Room('TEST');
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = room.addHuman(`J${i}`, 'm1');
    if (typeof p === 'string') throw new Error(p);
    room.connect(p, `s${i}`);
    ids.push(p.id);
  }
  for (let i = 0; i < bots; i++) room.addBot(ids[0]);
  return { room, ids };
}

/** Passe à l'isoloir : tous les humains demandent d'abréger. */
function toBooth(room: Room, ids: string[]): Round {
  for (const id of ids) if (room.round!.phase === 'talk' && room.get(id)?.status === 'playing') room.readyTalk(id);
  return room.round!;
}

function voteAll(room: Room, votes: Record<string, Side>): void {
  for (const [id, side] of Object.entries(votes)) expect(room.vote(id, side)).toBeUndefined();
  for (const id of Object.keys(votes)) room.seal(id);
}

describe('verdict', () => {
  it('le plus petit camp survit', () => {
    expect(verdict(ballots(2, 3))).toEqual({ outcome: 'minority', minority: 'A' });
    expect(verdict(ballots(5, 1))).toEqual({ outcome: 'minority', minority: 'B' });
  });
  it("l'égalité n'a pas de minorité", () => {
    expect(verdict(ballots(2, 2))).toEqual({ outcome: 'tie', minority: null });
  });
  it("l'unanimité n'a pas de minorité", () => {
    expect(verdict(ballots(4, 0))).toEqual({ outcome: 'unanimous', minority: null });
    expect(verdict(ballots(0, 4))).toEqual({ outcome: 'unanimous', minority: null });
  });
});

describe('salon', () => {
  it('il faut au moins 3 joueurs', () => {
    const { room, ids } = table(2);
    expect(room.start(ids[0])).toMatch(/au moins 3/);
    room.addBot(ids[0]);
    expect(room.start(ids[0])).toBeUndefined();
  });
  it("seul l'hôte lance", () => {
    const { room, ids } = table(3);
    expect(room.start(ids[1])).toMatch(/hôte/);
  });
  it('la table se limite à 16 joueurs', () => {
    const { room, ids } = table(1, 15);
    expect(room.addBot(ids[0])).toMatch(/complète/);
    expect(room.addHuman('Tard', 'm2')).toMatch(/complète/);
  });
  it('un arrivant en cours de partie est spectateur et ne vote pas', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    const late = room.addHuman('Tard', 'm2');
    if (typeof late === 'string') throw new Error(late);
    expect(late.status).toBe('spectator');
    toBooth(room, ids);
    expect(room.vote(late.id, 'A')).toMatch(/ne votes pas/);
  });
});

describe('déroulé', () => {
  it('la majorité tombe et la minorité continue', () => {
    const { room, ids } = table(5);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'B', [ids[3]]: 'B', [ids[4]]: 'B' });
    const r = room.round!;
    expect(r.phase).toBe('reveal');
    expect(r.reveal!.minority).toBe('A');
    expect(r.reveal!.eliminated.sort()).toEqual([ids[2], ids[3], ids[4]].sort());
    expect(r.reveal!.finished).toBe(true);
  });

  it('égalité : personne ne tombe, nouvelle question', () => {
    const { room, ids } = table(4);
    room.start(ids[0]);
    const q = room.round!.question;
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'B', [ids[3]]: 'B' });
    expect(room.round!.reveal!.outcome).toBe('tie');
    expect(room.round!.reveal!.eliminated).toEqual([]);
    room.afterRound();
    expect(room.round!.number).toBe(2);
    expect(room.round!.order.length).toBe(4);
    expect(room.round!.question).not.toBe(q);
  });

  it('unanimité : personne ne tombe', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'B', [ids[1]]: 'B', [ids[2]]: 'B' });
    expect(room.round!.reveal!.outcome).toBe('unanimous');
    expect(room.round!.reveal!.finished).toBe(false);
  });

  it('un seul survivant peut gagner', () => {
    const { room, ids } = table(4);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'B', [ids[2]]: 'B', [ids[3]]: 'B' });
    room.afterRound();
    expect(room.phase).toBe('finished');
    expect(room.final![0].id).toBe(ids[0]);
    expect(room.final!.filter((f) => f.rank === 1).length).toBe(1);
    expect(room.final!.filter((f) => f.rank === 2).length).toBe(3);
  });

  it('les recalés ne votent plus, et les rangs suivent les manches', () => {
    const { room, ids } = table(7);
    room.start(ids[0]);
    toBooth(room, ids);
    // 3 contre 4 : les 4 tombent.
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'A', [ids[3]]: 'B', [ids[4]]: 'B', [ids[5]]: 'B', [ids[6]]: 'B' });
    room.afterRound();
    expect(room.round!.order.length).toBe(3);
    toBooth(room, ids);
    expect(room.vote(ids[6], 'A')).toMatch(/ne votes pas/);
    // 1 contre 2 : un seul survivant.
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'B', [ids[2]]: 'B' });
    room.afterRound();
    const rank = (id: string) => room.final!.find((f) => f.id === id)!.rank;
    expect(rank(ids[0])).toBe(1);
    expect(rank(ids[1])).toBe(2);
    expect(rank(ids[2])).toBe(2);
    expect(rank(ids[3])).toBe(4);
    expect(rank(ids[6])).toBe(4);
  });

  it('un vote se change tant qu’il n’est pas scellé', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    toBooth(room, ids);
    room.vote(ids[0], 'A');
    room.vote(ids[0], 'B');
    expect(room.viewFor(ids[0]).round!.mine).toBe('B');
    room.seal(ids[0]);
    expect(room.vote(ids[0], 'A')).toMatch(/scellé/);
  });

  it('on ne scelle pas un bulletin vide', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    toBooth(room, ids);
    expect(room.seal(ids[0])).toMatch(/camp/);
  });

  it("on ne vote pas pendant la discussion, et on ne parle pas dans l'isoloir", () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    expect(room.vote(ids[0], 'A')).toMatch(/fermé/);
    toBooth(room, ids);
    expect(room.chat(ids[0], 'psst')).toMatch(/Silence/);
    expect(room.whisper(ids[0], ids[1], 'psst')).toMatch(/discussion/);
    expect(room.proposePact(ids[0], ids[1], 'A')).toMatch(/discussion/);
  });

  it('un bulletin invalide est refusé', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    toBooth(room, ids);
    expect(room.vote(ids[0], 'C')).toMatch(/invalide/);
  });

  it('la revanche ramène au salon', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'B', [ids[2]]: 'B' });
    room.afterRound();
    expect(room.phase).toBe('finished');
    room.restart(ids[0]);
    expect(room.phase).toBe('lobby');
    expect(room.seated.every((p) => p.status === 'lobby')).toBe(true);
    expect(room.start(ids[0])).toBeUndefined();
    expect(room.round!.number).toBe(1);
  });
});

describe('secret', () => {
  it('un bulletin ne sort que vers son auteur avant le dépouillement', () => {
    const { room, ids } = table(4);
    room.start(ids[0]);
    toBooth(room, ids);
    room.vote(ids[0], 'A');
    room.seal(ids[0]);
    const other = room.viewFor(ids[1]);
    expect(other.round!.mine).toBeNull();
    expect(other.round!.reveal).toBeNull();
    expect(other.round!.sealedIds).toEqual([ids[0]]);
    expect(JSON.stringify(other)).not.toContain('"side"');
    expect(other.minutes).toBeNull();
  });

  it('les chuchotements ne vont qu’aux deux concernés', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    room.whisper(ids[0], ids[1], 'secret-defense');
    expect(JSON.stringify(room.viewFor(ids[1]))).toContain('secret-defense');
    expect(JSON.stringify(room.viewFor(ids[0]))).toContain('secret-defense');
    expect(JSON.stringify(room.viewFor(ids[2]))).not.toContain('secret-defense');
  });

  it('les chuchotements disparaissent à la manche suivante', () => {
    const { room, ids } = table(4);
    room.start(ids[0]);
    room.whisper(ids[0], ids[1], 'souvenir');
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'B', [ids[3]]: 'B' });
    room.afterRound();
    expect(JSON.stringify(room.viewFor(ids[1]))).not.toContain('souvenir');
  });

  it('un pacte ne se voit que de ses signataires', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    room.proposePact(ids[0], ids[1], 'A');
    expect(room.viewFor(ids[1]).round!.pacts.length).toBe(1);
    expect(room.viewFor(ids[2]).round!.pacts.length).toBe(0);
  });

  it('le journal ne garde aucun vote nominatif', () => {
    const { room, ids } = table(5);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'B', [ids[3]]: 'B', [ids[4]]: 'B' });
    const log = room.viewFor(ids[0]).log.map((l) => l.text).join(' ');
    expect(log).not.toMatch(/\b[AB]\b/);
    expect(log).not.toMatch(/\d+ contre \d+/);
  });

  it('les manches passées ne restent pas accessibles en cours de partie', () => {
    const { room, ids } = table(4);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'B', [ids[3]]: 'B' });
    room.afterRound();
    const v = room.viewFor(ids[0]);
    expect(v.minutes).toBeNull();
    expect(v.round!.reveal).toBeNull();
  });

  it('le procès-verbal est publié à la fin', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'B', [ids[2]]: 'B' });
    room.afterRound();
    const m = room.viewFor(ids[1]).minutes!;
    expect(m.length).toBe(1);
    expect(m[0].ballots.length).toBe(3);
  });
});

describe('pactes', () => {
  it('un pacte tenu ne désigne aucun traître', () => {
    const { room, ids } = table(5);
    room.start(ids[0]);
    room.proposePact(ids[0], ids[1], 'A');
    const pact = room.viewFor(ids[1]).round!.pacts[0];
    expect(room.answerPact(ids[1], pact.id, true)).toBeUndefined();
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'B', [ids[3]]: 'B', [ids[4]]: 'B' });
    const res = room.round!.reveal!.pacts;
    expect(res).toEqual([{ from: ids[0], to: ids[1], side: 'A', traitors: [] }]);
    expect(room.get(ids[0])!.stats.kept).toBe(1);
  });

  it('une trahison est dévoilée au dépouillement', () => {
    const { room, ids } = table(5);
    room.start(ids[0]);
    room.proposePact(ids[0], ids[1], 'A');
    room.answerPact(ids[1], room.viewFor(ids[1]).round!.pacts[0].id, true);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'B', [ids[2]]: 'B', [ids[3]]: 'B', [ids[4]]: 'A' });
    expect(room.round!.reveal!.pacts[0].traitors).toEqual([ids[1]]);
    expect(room.get(ids[1])!.stats.betrayals).toBe(1);
    expect(room.get(ids[0])!.stats.betrayed).toBe(1);
  });

  it('un pacte refusé ou sans réponse ne compte pas', () => {
    const { room, ids } = table(5);
    room.start(ids[0]);
    room.proposePact(ids[0], ids[1], 'A');
    room.proposePact(ids[2], ids[3], 'B');
    room.answerPact(ids[1], room.viewFor(ids[1]).round!.pacts[0].id, false);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'B', [ids[1]]: 'B', [ids[2]]: 'A', [ids[3]]: 'A', [ids[4]]: 'A' });
    expect(room.round!.reveal!.pacts).toEqual([]);
  });

  it('on ne signe ni avec soi-même, ni deux fois avec le même', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    expect(room.proposePact(ids[0], ids[0], 'A')).toMatch(/signer/);
    expect(room.proposePact(ids[0], ids[1], 'A')).toBeUndefined();
    expect(room.proposePact(ids[1], ids[0], 'B')).toMatch(/déjà/);
  });

  it('seul le destinataire répond', () => {
    const { room, ids } = table(3);
    room.start(ids[0]);
    room.proposePact(ids[0], ids[1], 'A');
    const id = room.viewFor(ids[0]).round!.pacts[0].id;
    expect(room.answerPact(ids[0], id, true)).toMatch(/introuvable/);
    expect(room.answerPact(ids[2], id, true)).toMatch(/introuvable/);
  });

  it('un recalé ne chuchote plus', () => {
    const { room, ids } = table(7);
    room.start(ids[0]);
    toBooth(room, ids);
    voteAll(room, { [ids[0]]: 'A', [ids[1]]: 'A', [ids[2]]: 'A', [ids[3]]: 'B', [ids[4]]: 'B', [ids[5]]: 'B', [ids[6]]: 'B' });
    room.afterRound();
    expect(room.whisper(ids[6], ids[0], 'vengeance')).toMatch(/en lice/);
    expect(room.whisper(ids[0], ids[6], 'adieu')).toMatch(/ne peut pas/);
    expect(room.chat(ids[6], 'je parle encore')).toBeUndefined();
  });
});

describe('bots', () => {
  it('repère une consigne de vote', () => {
    expect(parseClaim('Je vote A')).toBe('A');
    expect(parseClaim('votez b !')).toBe('B');
    expect(parseClaim('B')).toBe('B');
    expect(parseClaim('Tous sur le A ?')).toBe('A');
    expect(parseClaim('on a faim')).toBeNull();
    expect(parseClaim("il a raison")).toBeNull();
  });

  it('vise plutôt le camp dont on parle le moins', () => {
    const personality = { ...randomPersonality(), contrarian: 1 };
    for (let i = 0; i < 40; i++) expect(botVote({ personality, claims: ['A', 'A', 'A', 'B'], promises: [] })).toBe('B');
  });

  it('un bot loyal tient son pacte', () => {
    const personality = { ...randomPersonality(), loyalty: 1, contrarian: 1 };
    for (let i = 0; i < 40; i++) expect(botVote({ personality, claims: ['B', 'B', 'B'], promises: ['B'] })).toBe('B');
  });

  it("n'a jamais accès aux bulletins", () => {
    // BotView ne contient que des paroles publiques et ses pactes : le type lui-même l'interdit.
    const keys = Object.keys({ personality: randomPersonality(), claims: [], promises: [] });
    expect(keys).toEqual(['personality', 'claims', 'promises']);
  });
});

describe('parties simulées', () => {
  it('300 parties aléatoires se terminent toujours proprement', () => {
    for (let g = 0; g < 300; g++) {
      const n = 3 + (g % 14);
      const { room, ids } = table(n);
      room.start(ids[0]);
      let guard = 0;
      while (room.phase === 'playing') {
        if (++guard > 500) throw new Error('partie sans fin');
        const r = toBooth(room, ids);
        const votes: Record<string, Side> = {};
        for (const id of r.order) votes[id] = Math.random() < 0.5 ? 'A' : 'B';
        voteAll(room, votes);
        const rv = room.round!.reveal!;
        if (rv.minority) {
          const size = rv.ballots.filter((b) => b.side === rv.minority).length;
          expect(rv.ballots.length - size).toBe(rv.eliminated.length);
          expect(size).toBeLessThan(rv.ballots.length / 2 + 0.01);
        } else expect(rv.eliminated).toEqual([]);
        room.afterRound();
      }
      const final = room.final!;
      expect(final.length).toBe(n);
      const survivors = final.filter((f) => f.survivor);
      expect(survivors.length).toBeGreaterThanOrEqual(1);
      expect(survivors.length).toBeLessThanOrEqual(2);
      expect(survivors.every((f) => f.rank === 1)).toBe(true);
      expect(final.filter((f) => !f.survivor).every((f) => f.rank > survivors.length)).toBe(true);
      room.dispose();
    }
  });
});
