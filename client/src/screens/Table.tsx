// La partie : discussion sur papier, puis l'écran s'éteint pour l'isoloir, puis le dépouillement.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, Handshake, Lock, LogOut, Send, Smile, Square, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { EMOTES, MAX_MESSAGE, TAUNTS, type PlayerView, type RoomView, type RoundView, type Side } from '../../../shared/protocol';
import { Mask } from '../components/Mask';
import { Button, EmoteLayer, Logo } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, secondsLeft, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';
import { Reveal } from './Reveal';

function clock(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
}

function TopBar({ view, round }: { view: RoomView; round: RoundView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const now = useTick(250);
  const left = secondsLeft(round.endsAt, now);
  return (
    <header className="topbar">
      <div className="topbar-round">
        <Logo size="sm" />
        <span className="dossier">Manche {round.number}</span>
      </div>
      {round.phase !== 'reveal' && <div className={cls('clock', left <= 10 && 'is-hot')}>{clock(left)}</div>}
      <div className="topbar-tools">
        <button type="button" className="icon-btn" aria-label={prefs.sound ? 'Couper le son' : 'Activer le son'} onClick={() => setPrefs({ sound: !prefs.sound })}>
          {prefs.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
        <button type="button" className="icon-btn" aria-label="Règles" onClick={() => setRulesOpen(true)}>
          <BookOpen size={19} />
        </button>
        {isHost && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Lever la séance"
            onClick={() => {
              if (window.confirm('Arrêter la partie pour tout le monde ?')) void send('game:end');
            }}
          >
            <Square size={17} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Quitter"
          onClick={() => {
            if (window.confirm('Quitter la table ?')) void leaveRoom();
          }}
        >
          <LogOut size={19} />
        </button>
      </div>
    </header>
  );
}

function QuestionCard({ round }: { round: RoundView }) {
  return (
    <section className="question">
      <span className="dossier">Question soumise au vote</span>
      <h2>{round.question.text}</h2>
      <div className="question-sides">
        <span className="side-tag side-a">
          <b>A</b> {round.question.a}
        </span>
        <span className="side-tag side-b">
          <b>B</b> {round.question.b}
        </span>
      </div>
    </section>
  );
}

function Seat({ p, me, selected, canPick, whispering, ready, onPick }: { p: PlayerView; me: boolean; selected: boolean; canPick: boolean; whispering: boolean; ready: boolean; onPick: () => void }) {
  return (
    <button type="button" className={cls('seat', me && 'is-me', selected && 'is-selected', whispering && 'is-whispering')} disabled={!canPick} aria-pressed={selected} aria-label={me ? `${p.name} (toi)` : `Parler à ${p.name} en secret`} onClick={onPick}>
      <Mask avatar={p.avatar} className="seat-mask" />
      <span className="seat-name">{me ? 'Toi' : p.name}</span>
      {ready && (
        <span className="seat-ready" title="Prêt à voter">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      {(p.autopilot || !p.connected) && <span className="seat-off">absent</span>}
    </button>
  );
}

interface Line {
  key: string;
  at: number;
  kind: 'chat' | 'system' | 'round' | 'eliminate' | 'win' | 'whisper-in' | 'whisper-out';
  who?: string;
  text: string;
}

function Stream({ view, round }: { view: RoomView; round: RoundView }) {
  const box = useRef<HTMLDivElement>(null);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = view.log.slice(-40).map((l) => {
      if (l.kind === 'chat' && l.playerId) {
        const who = view.players.find((p) => p.id === l.playerId)?.name ?? '';
        return { key: `l${l.id}`, at: l.at, kind: 'chat', who, text: l.text.slice(who.length + 3) };
      }
      return { key: `l${l.id}`, at: l.at, kind: l.kind, text: l.text };
    });
    for (const w of round.whispers) {
      const mine = w.from === view.me;
      out.push({ key: `w${w.id}`, at: w.at, kind: mine ? 'whisper-out' : 'whisper-in', who: mine ? `→ ${name(w.to)}` : name(w.from), text: w.text });
    }
    return out.sort((a, b) => a.at - b.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.log, round.whispers, view.me]);
  const last = lines.length ? lines[lines.length - 1].key : '';
  const first = useRef(true);
  useEffect(() => {
    // Défile dans la conversation seulement : la page, elle, ne doit pas bouger.
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
    if (first.current) {
      first.current = false;
      return;
    }
    const l = lines[lines.length - 1];
    if (l?.kind === 'whisper-in') sfx.whisper();
    else if (l?.kind === 'chat') sfx.message();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);
  return (
    <div className="stream" ref={box} role="log" aria-label="Conversation">
      {lines.map((l) => (
        <p key={l.key} className={cls('line', `is-${l.kind}`)}>
          {l.kind.startsWith('whisper') && <Lock size={11} className="line-lock" />}
          {l.who && <b>{l.who} </b>}
          {l.text}
        </p>
      ))}
    </div>
  );
}

function PactStrip({ view, round }: { view: RoomView; round: RoundView }) {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const pacts = round.pacts;
  if (!pacts.length) return null;
  return (
    <div className="pacts">
      <AnimatePresence initial={false}>
        {pacts.map((p) => {
          const incoming = p.to === view.me;
          const other = name(incoming ? p.from : p.to);
          return (
            <motion.div key={p.id} className={cls('pact', `is-${p.status}`)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <Handshake size={15} />
              {p.status === 'pending' && incoming && (
                <>
                  <span>
                    <b>{other}</b> te propose un pacte sur <b className="pact-side">{p.side}</b>
                  </span>
                  <span className="pact-actions">
                    <button type="button" className="mini-btn is-ink" onClick={() => void send('pact:answer', { id: p.id, accept: true })}>
                      Signer
                    </button>
                    <button type="button" className="mini-btn" onClick={() => void send('pact:answer', { id: p.id, accept: false })}>
                      Refuser
                    </button>
                  </span>
                </>
              )}
              {p.status === 'pending' && !incoming && (
                <span>
                  En attente de <b>{other}</b> : pacte sur <b className="pact-side">{p.side}</b>…
                </span>
              )}
              {p.status === 'accepted' && (
                <span>
                  Pacte avec <b>{other}</b> : <b className="pact-side">{p.side}</b>
                </span>
              )}
              {p.status === 'refused' && (
                <span>
                  {incoming ? 'Tu as refusé' : <><b>{other}</b> a refusé</>} le pacte sur {p.side}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Composer({ view, round, target, setTarget, canWhisper }: { view: RoomView; round: RoundView; target: PlayerView | null; setTarget: (id: string | null) => void; canWhisper: boolean }) {
  const [text, setText] = useState('');
  const [palette, setPalette] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    if (target) await send('whisper', { to: target.id, text: value });
    else await send('chat', { text: value });
  };
  const hasPact = target && round.pacts.some((p) => p.status !== 'refused' && (p.from === target.id || p.to === target.id));
  const propose = async (side: Side) => {
    if (!target) return;
    sfx.paper();
    await send('pact:propose', { to: target.id, side });
  };
  return (
    <div className="composer">
      {target && canWhisper && (
        <div className="composer-target">
          <span className="composer-who">
            <Lock size={13} /> En secret avec <b>{target.name}</b>
          </span>
          {!hasPact && (
            <span className="composer-pacts">
              <button type="button" className="mini-btn" onClick={() => void propose('A')}>
                Pacte sur A
              </button>
              <button type="button" className="mini-btn" onClick={() => void propose('B')}>
                Pacte sur B
              </button>
            </span>
          )}
          <button type="button" className="icon-btn is-small" aria-label="Revenir à toute la table" onClick={() => setTarget(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {palette && (
        <div className="palette">
          {EMOTES.map((e) => (
            <button
              key={e}
              type="button"
              className="palette-emo"
              onClick={() => {
                socket.emit('emote', { emoji: e });
                setPalette(false);
              }}
            >
              {e}
            </button>
          ))}
          {TAUNTS.map((t) => (
            <button
              key={t}
              type="button"
              className="palette-taunt"
              onClick={() => {
                socket.emit('emote', { emoji: t });
                setPalette(false);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <form className="composer-row" onSubmit={submit}>
        <button type="button" className="icon-btn" aria-label="Réactions" aria-expanded={palette} onClick={() => setPalette((v) => !v)}>
          <Smile size={20} />
        </button>
        <input className={cls('input', target && 'is-secret')} placeholder={target ? `Message secret pour ${target.name}…` : 'Parler à toute la table…'} value={text} maxLength={MAX_MESSAGE} aria-label="Message" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="icon-btn is-solid" aria-label="Envoyer" disabled={!text.trim()}>
          <Send size={18} />
        </button>
      </form>
      {view.round && !canWhisper && <p className="muted small composer-note">Tu peux encore parler à la table, mais plus chuchoter.</p>}
    </div>
  );
}

function Talk({ view, round }: { view: RoomView; round: RoundView }) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const seen = useStore((s) => s.whispersSeen);
  const meInGame = round.order.includes(view.me) && view.players.find((p) => p.id === view.me)?.status === 'playing';
  const iAmReady = round.readyIds.includes(view.me);
  const alive = view.players.filter((p) => round.order.includes(p.id));
  const fallen = view.players.filter((p) => p.status === 'eliminated');
  const target = targetId ? view.players.find((p) => p.id === targetId && round.order.includes(p.id)) ?? null : null;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const latest = seen.length ? seen[seen.length - 1] : null;
  const pending = round.pacts.filter((p) => p.status === 'pending' && p.to === view.me).length;

  useEffect(() => {
    if (pending) {
      sfx.paper();
      vibrate(30);
    }
  }, [pending]);

  // Une nouvelle manche repart sans destinataire.
  useEffect(() => setTargetId(null), [round.number]);

  return (
    <div className="talk">
      <div className="talk-board">
        <QuestionCard round={round} />
        <section className="seats-wrap">
          <p className="seats-caption" aria-live="polite">
            {latest ? (
              <motion.span key={latest.id} className="is-whisper" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {name(latest.from)} et {name(latest.to)} chuchotent
              </motion.span>
            ) : meInGame ? (
              'Touche un joueur pour lui parler en secret'
            ) : (
              'Les joueurs en lice négocient'
            )}
          </p>
          <div className="seats">
            {alive.map((p) => (
              <Seat
                key={p.id}
                p={p}
                me={p.id === view.me}
                selected={p.id === targetId}
                canPick={meInGame && p.id !== view.me}
                whispering={seen.some((w) => w.from === p.id || w.to === p.id)}
                ready={round.readyIds.includes(p.id)}
                onPick={() => setTargetId(p.id === targetId ? null : p.id)}
              />
            ))}
          </div>
          {fallen.length > 0 && (
            <div className="fallen" aria-label="Joueurs tombés">
              <span className="dossier">Tombés</span>
              {fallen.map((p) => (
                <span key={p.id} className="fallen-one" title={p.name}>
                  <Mask avatar={p.avatar} out />
                </span>
              ))}
            </div>
          )}
        </section>
        {meInGame && (
          <Button variant={iAmReady ? 'default' : 'primary'} className="ready-btn" icon={iAmReady ? <Check size={18} /> : undefined} onClick={() => void send('game:readyTalk')}>
            {iAmReady ? 'Prêt : on attend les autres' : 'Je suis prêt à voter'}
          </Button>
        )}
      </div>
      <div className="talk-chat">
        <PactStrip view={view} round={round} />
        <Stream view={view} round={round} />
        <Composer view={view} round={round} target={target} setTarget={setTargetId} canWhisper={meInGame} />
      </div>
    </div>
  );
}

function Booth({ view, round }: { view: RoomView; round: RoundView }) {
  const inGame = round.order.includes(view.me);
  const now = useTick(200);
  const left = secondsLeft(round.endsAt, now);
  const lastTick = useRef(left);
  useEffect(() => {
    if (left !== lastTick.current && left <= 5 && left > 0) sfx.tick();
    lastTick.current = left;
  }, [left]);
  const pick = (side: Side) => {
    if (round.sealed) return;
    sfx.pick();
    vibrate(15);
    void send('game:vote', { side });
  };
  const seal = () => {
    sfx.seal();
    vibrate(40);
    void send('game:seal');
  };
  return (
    <motion.div className="booth-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.4 }}>
      <p className="booth-silence">Silence. Vous êtes seul.</p>
      <h2 className="booth-q">{round.question.text}</h2>
      {inGame ? (
        <>
          <div className="doors" role="radiogroup" aria-label="Ton vote">
            {(['A', 'B'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={round.mine === s} disabled={round.sealed} className={cls('door', `door-${s}`, round.mine === s && 'is-on', round.mine && round.mine !== s && 'is-off')} onClick={() => pick(s)}>
                <span className="door-letter">{s}</span>
                <span className="door-answer">{s === 'A' ? round.question.a : round.question.b}</span>
              </button>
            ))}
          </div>
          {round.sealed ? (
            <p className="booth-sealed">
              <Lock size={16} /> Bulletin scellé. Plus rien ne bouge.
            </p>
          ) : (
            <Button variant="red" className="btn-lg seal-btn" disabled={!round.mine} onClick={seal}>
              {round.mine ? `Sceller mon bulletin : ${round.mine}` : 'Choisis A ou B'}
            </Button>
          )}
        </>
      ) : (
        <p className="booth-watch">Les joueurs en lice votent. Tu ne verras rien avant le dépouillement.</p>
      )}
      <div className="booth-seals" aria-label="Bulletins scellés">
        {round.order.map((id) => {
          const p = view.players.find((x) => x.id === id);
          if (!p) return null;
          return <Mask key={id} avatar={p.avatar} className={cls('booth-mask', round.sealedIds.includes(id) && 'is-sealed')} />;
        })}
      </div>
    </motion.div>
  );
}

export function Table({ view }: { view: RoomView }) {
  const round = view.round;
  const phase = round?.phase;
  const dark = phase !== 'talk';
  const prev = useRef(phase);
  useEffect(() => {
    if (prev.current !== phase && phase === 'vote') {
      sfx.curtain();
      vibrate([30, 60, 30]);
    }
    if (prev.current !== phase && phase === 'talk') sfx.paper();
    prev.current = phase;
  }, [phase]);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0a09' : '#efe9dc');
    return () => document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#efe9dc');
  }, [dark]);

  if (!round) return null;
  return (
    <main className={cls('game', dark ? 'is-dark' : 'paper')}>
      <AnimatePresence>
        {phase === 'vote' && (
          <motion.div key={`c${round.number}`} className="curtain" initial={{ scaleY: 1 }} animate={{ scaleY: 0 }} transition={{ delay: 0.3, duration: 0.5, ease: 'easeIn' }} aria-hidden />
        )}
      </AnimatePresence>
      <TopBar view={view} round={round} />
      {phase === 'talk' && <Talk key={round.number} view={view} round={round} />}
      {phase === 'vote' && <Booth view={view} round={round} />}
      {phase === 'reveal' && round.reveal && <Reveal key={round.number} view={view} round={round} reveal={round.reveal} />}
      <EmoteLayer players={view.players} />
    </main>
  );
}
