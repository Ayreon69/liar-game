// Le dépouillement : un bulletin à la fois, le tampon, ceux qui tombent, puis les pactes dévoilés.
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { REVEAL_BASE_MS, REVEAL_PACT_MS, REVEAL_STEP_MS, REVEAL_VERDICT_MS, type Reveal as RevealData, type RoomView, type RoundView, type Side } from '../../../shared/protocol';
import { Mask } from '../components/Mask';
import { Button, Stamp } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, useTick, vibrate } from '../lib/util';
import { send } from '../net';

export function Reveal({ view, round, reveal }: { view: RoomView; round: RoundView; reveal: RevealData }) {
  const now = useTick(100);
  const n = reveal.ballots.length;
  const total = REVEAL_BASE_MS + n * REVEAL_STEP_MS + REVEAL_VERDICT_MS + reveal.pacts.length * REVEAL_PACT_MS;
  // Le temps est calé sur le serveur : un joueur qui revient retrouve le dépouillement où il en est.
  const elapsed = now - (round.revealMinAt - total);
  const shown = Math.max(0, Math.min(n, Math.floor((elapsed - REVEAL_BASE_MS) / REVEAL_STEP_MS) + 1));
  const stamped = elapsed >= REVEAL_BASE_MS + n * REVEAL_STEP_MS;
  const pactsAt = REVEAL_BASE_MS + n * REVEAL_STEP_MS + REVEAL_VERDICT_MS;
  const pactsShown = Math.max(0, Math.min(reveal.pacts.length, Math.floor((elapsed - pactsAt) / REVEAL_PACT_MS) + 1));
  const canNext = now >= round.revealMinAt;

  const iAmIn = round.order.includes(view.me);
  const iFell = reveal.eliminated.includes(view.me);
  const player = (id: string) => view.players.find((p) => p.id === id);
  const name = (id: string) => (id === view.me ? 'Toi' : player(id)?.name ?? '?');
  const iAmReady = round.readyIds.includes(view.me);

  const lastShown = useRef(shown);
  useEffect(() => {
    if (shown > lastShown.current) sfx.ballot(shown);
    lastShown.current = shown;
  }, [shown]);

  const wasStamped = useRef(stamped);
  useEffect(() => {
    if (stamped && !wasStamped.current) {
      sfx.stamp();
      vibrate(80);
      if (iAmIn && reveal.outcome === 'minority') setTimeout(() => (iFell ? sfx.fall() : sfx.survive()), 450);
    }
    wasStamped.current = stamped;
  }, [stamped, iAmIn, iFell, reveal.outcome]);

  const lastPact = useRef(pactsShown);
  useEffect(() => {
    if (pactsShown > lastPact.current) {
      const p = reveal.pacts[pactsShown - 1];
      if (p?.traitors.length) {
        sfx.betrayal();
        vibrate(50);
      } else sfx.kept();
    }
    lastPact.current = pactsShown;
  }, [pactsShown, reveal.pacts]);

  const column = (side: Side) => reveal.ballots.slice(0, shown).filter((b) => b.side === side);
  const label = (side: Side) => (side === 'A' ? round.question.a : round.question.b);

  return (
    <div className="reveal">
      <p className="reveal-eyebrow">Dépouillement</p>
      <h2 className="reveal-q">{round.question.text}</h2>

      <div className="urns">
        {(['A', 'B'] as const).map((side) => {
          const won = stamped && reveal.minority === side;
          const lost = stamped && reveal.minority !== null && reveal.minority !== side;
          return (
            <section key={side} className={cls('urn', won && 'is-won', lost && 'is-lost')}>
              <header>
                <b>{side}</b> <span>{label(side)}</span>
              </header>
              <div className="urn-ballots">
                {column(side).map((b) => {
                  const p = player(b.id);
                  return (
                    <div key={b.id} className={cls('ballot', b.id === view.me && 'is-me')}>
                      {p && <Mask avatar={p.avatar} out={lost} />}
                      <span>{name(b.id)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="verdict">
        {stamped && reveal.outcome === 'minority' && (
          <>
            <Stamp>La minorité : {reveal.minority}</Stamp>
            {iAmIn ? (
              <motion.p className={cls('verdict-me', iFell ? 'is-fell' : 'is-safe')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                {iFell ? 'Tu tombes.' : 'Tu survis.'}
              </motion.p>
            ) : (
              <motion.p className="verdict-me" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                {reveal.eliminated.length > 1 ? 'La majorité tombe.' : 'Un joueur tombe.'}
              </motion.p>
            )}
          </>
        )}
        {stamped && reveal.outcome === 'tie' && (
          <>
            <Stamp>Égalité</Stamp>
            <p className="verdict-me">Pas de minorité. Personne ne tombe, on revote.</p>
          </>
        )}
        {stamped && reveal.outcome === 'unanimous' && (
          <>
            <Stamp>Unanimité</Stamp>
            <p className="verdict-me">Pas de minorité. Personne ne tombe, on revote.</p>
          </>
        )}
      </div>

      {pactsShown > 0 && (
        <ul className="pact-results">
          {reveal.pacts.slice(0, pactsShown).map((p) => {
            const key = `${p.from}-${p.to}`;
            if (!p.traitors.length) {
              return (
                <motion.li key={key} className="pact-result is-kept" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  Pacte tenu sur {p.side} : <b>{name(p.from)}</b> et <b>{name(p.to)}</b>
                </motion.li>
              );
            }
            if (p.traitors.length === 2) {
              return (
                <motion.li key={key} className="pact-result is-broken" initial={{ opacity: 0, scale: 1.3 }} animate={{ opacity: 1, scale: 1 }}>
                  <span className="traitor-tag">Double trahison</span> <b>{name(p.from)}</b> et <b>{name(p.to)}</b>, pacte sur {p.side}
                </motion.li>
              );
            }
            const traitor = p.traitors[0];
            const victim = traitor === p.from ? p.to : p.from;
            return (
              <motion.li key={key} className="pact-result is-broken" initial={{ opacity: 0, scale: 1.3 }} animate={{ opacity: 1, scale: 1 }}>
                <span className="traitor-tag">Trahison</span>{' '}
                {traitor === view.me ? (
                  <>
                    Tu as trahi <b>{name(victim)}</b>
                  </>
                ) : victim === view.me ? (
                  <>
                    <b>{name(traitor)}</b> t'a trahi
                  </>
                ) : (
                  <>
                    <b>{name(traitor)}</b> a trahi <b>{name(victim)}</b>
                  </>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}

      <div className="reveal-next">
        {canNext && (
          <Button variant={iAmReady ? 'default' : 'primary'} disabled={iAmReady} onClick={() => void send('game:next')}>
            {iAmReady ? 'On attend les autres…' : reveal.finished ? 'Voir le procès-verbal' : 'Question suivante'}
          </Button>
        )}
      </div>
    </div>
  );
}
