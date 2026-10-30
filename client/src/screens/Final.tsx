// Fin de partie : les survivants, le classement, les distinctions et le procès-verbal, publié seulement maintenant.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FinalEntry, RoomView, Side } from '../../../shared/protocol';
import { Mask } from '../components/Mask';
import { Button, Logo, Stamp } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, plural } from '../lib/util';
import { leaveRoom, send } from '../net';

interface Award {
  title: string;
  entry: FinalEntry;
  detail: string;
}

function awards(final: FinalEntry[]): Award[] {
  const best = (score: (f: FinalEntry) => number) => {
    const sorted = [...final].sort((a, b) => score(b) - score(a));
    return score(sorted[0]) > 0 ? sorted[0] : null;
  };
  const list: Award[] = [];
  const judas = best((f) => f.stats.betrayals);
  if (judas) list.push({ title: 'Le serpent', entry: judas, detail: `${plural(judas.stats.betrayals, 'pacte')} trahi${judas.stats.betrayals > 1 ? 's' : ''}` });
  const honest = best((f) => f.stats.kept);
  if (honest) list.push({ title: 'Parole tenue', entry: honest, detail: `${plural(honest.stats.kept, 'pacte')} respecté${honest.stats.kept > 1 ? 's' : ''}` });
  const naive = best((f) => f.stats.betrayed);
  if (naive) list.push({ title: 'Le cœur trop grand', entry: naive, detail: `trahi ${naive.stats.betrayed} fois` });
  const plotter = best((f) => f.stats.whispers);
  if (plotter) list.push({ title: 'Le conspirateur', entry: plotter, detail: `${plural(plotter.stats.whispers, 'chuchotement')}` });
  const loud = best((f) => f.stats.messages);
  if (loud) list.push({ title: 'La grande gueule', entry: loud, detail: `${plural(loud.stats.messages, 'prise')} de parole` });
  const lonesome = final.filter((f) => f.stats.smallestMinority === 1)[0];
  if (lonesome) list.push({ title: 'Seul contre tous', entry: lonesome, detail: 'a survécu seul dans son camp' });
  return list;
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final ?? [];
  const minutes = view.minutes ?? [];
  const isHost = view.hostId === view.me;
  const survivors = final.filter((f) => f.survivor);
  const iSurvived = survivors.some((f) => f.id === view.me);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sfx.champion();
    if (iSurvived) {
      const colors = ['#14110f', '#c9231a', '#fbf7ec'];
      void confetti({ particleCount: 120, spread: 90, origin: { y: 0.35 }, colors, shapes: ['square'] });
      setTimeout(() => void confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, shapes: ['square'] }), 450);
      setTimeout(() => void confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, shapes: ['square'] }), 700);
    }
  }, [iSurvived]);

  const list = awards(final);
  const person = (id: string) => view.players.find((p) => p.id === id) ?? final.find((f) => f.id === id);

  return (
    <main className="paper">
      <div className="final">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <section className="final-head">
          <span className="dossier">Séance levée · {plural(minutes.length, 'manche')}</span>
          <div className={cls('final-survivors', survivors.length > 1 && 'is-duo')}>
            {survivors.map((s) => (
              <div key={s.id} className="final-survivor">
                <Mask avatar={s.avatar} />
                <b>{s.id === view.me ? 'Toi' : s.name}</b>
              </div>
            ))}
          </div>
          <h1>{iSurvived ? 'Tu as survécu.' : survivors.length > 1 ? 'Ils ont survécu.' : `${survivors[0]?.name ?? ''} a survécu.`}</h1>
          <Stamp className="final-stamp" tilt={-8}>
            {survivors.length > 1 ? 'Survivants' : 'Dernier debout'}
          </Stamp>
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Nouvelle séance
            </Button>
          ) : (
            <div className="waiting">
              <span className="spinner" /> En attente de la prochaine séance…
            </div>
          )}
        </div>

        <div className="lobby-grid">
          <section className="sheet">
            <h3>Classement</h3>
            <ol className="rank-list">
              {final.map((f) => (
                <li key={f.id} className={cls('rank-row', f.id === view.me && 'is-me', !f.survivor && 'is-out')}>
                  <span className="rank-n">{f.rank}</span>
                  <Mask avatar={f.avatar} className="player-mask" out={!f.survivor} />
                  <span className="player-name">
                    {f.name}
                    {f.id === view.me && <span className="muted"> (toi)</span>}
                  </span>
                  <span className="muted small">{f.survivor ? 'en vie' : `manche ${f.outRound}`}</span>
                </li>
              ))}
            </ol>
          </section>

          {list.length > 0 && (
            <section className="sheet">
              <h3>Distinctions</h3>
              <ul className="award-list">
                {list.map((a) => (
                  <li key={a.title} className="award">
                    <Mask avatar={a.entry.avatar} className="player-mask" />
                    <div>
                      <b>{a.title}</b>
                      <span className="muted small">
                        {a.entry.name} : {a.detail}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="sheet minutes">
          <h3>Procès-verbal</h3>
          <p className="muted small">Tous les votes, enfin publics. À vous de régler vos comptes.</p>
          {minutes.map((m) => (
            <motion.article key={m.number} className="minute" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <header>
                <span className="dossier">Manche {m.number}</span>
                <p>{m.question.text}</p>
              </header>
              <div className="minute-sides">
                {(['A', 'B'] as Side[]).map((side) => (
                  <div key={side} className={cls('minute-side', m.minority === side && 'is-won')}>
                    <b>
                      {side} · {side === 'A' ? m.question.a : m.question.b}
                    </b>
                    <ul>
                      {m.ballots
                        .filter((x) => x.side === side)
                        .map((x) => (
                          <li key={x.id}>{person(x.id)?.name ?? '?'}</li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              {!m.minority && <p className="minute-note">{m.outcome === 'tie' ? 'Égalité : on a revoté.' : 'Unanimité : on a revoté.'}</p>}
            </motion.article>
          ))}
        </section>
      </div>
    </main>
  );
}
