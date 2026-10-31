// Accueil : la foule qui fond à chaque vote, pseudo + masque, créer / rejoindre une table, entraînement, règles.
import { motion } from 'framer-motion';
import { BookOpen, Bot, House, LogIn, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { MASK_LABELS, Mask } from '../components/Mask';
import { Button, Logo } from '../components/Ui';
import { cls } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const CROWD = 27;
const STAGES = [CROWD, 11, 4, 1];

/** La foule : à chaque vote, la majorité s'efface, jusqu'au dernier masque. */
function Crowd() {
  const [stage, setStage] = useState(0);
  const [order] = useState(() =>
    Array.from({ length: CROWD }, (_, i) => i)
      .map((i) => ({ i, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.i),
  );
  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 2400);
    return () => clearInterval(id);
  }, []);
  const alive = new Set(order.slice(0, STAGES[stage]));
  return (
    <div className="crowd" aria-hidden>
      {Array.from({ length: CROWD }, (_, i) => (
        <Mask key={i} avatar={AVATARS[i % AVATARS.length]} className={cls('crowd-mask', !alive.has(i) && 'is-gone', alive.size === 1 && alive.has(i) && 'is-last')} />
      ))}
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('lm:url', sync);
    return () => window.removeEventListener('lm:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <main className="paper home">
      <a className="all-games" href="https://akhis-games.onrender.com">
        <House size={16} aria-hidden /> Tous les jeux
      </a>
      <header className="home-hero">
        <p className="dossier">Convocation · Séance à huis clos</p>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">Vote en secret. Seuls les moins nombreux survivent.</p>
        <Crowd />
      </header>

      <motion.section className="sheet home-panel" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.5 }}>
        {invited && (
          <div className="invite-banner">
            Vous êtes convoqué à la table <b>{invited}</b>. Choisissez un pseudo et entrez.
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Numéro 12"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label">Ton masque</span>
        <div className="avatar-picker" role="radiogroup" aria-label="Ton masque">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={MASK_LABELS[a]} title={MASK_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              <Mask avatar={a} />
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <Button icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots: 8, autostart: true }))}>
              {busy === 'bots' ? 'Préparation…' : "S'entraîner contre 8 bots"}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        D'après le jeu de la minorité du manga <i>Liar Game</i> de Shinobu Kaitani. Création de fans, non officielle.
      </footer>
    </main>
  );
}
