// Salon : partage de la table, liste des joueurs, réglage de l'hôte et lancement.
import { motion } from 'framer-motion';
import { BookOpen, Bot, Check, Copy, Crown, LogOut, Play, QrCode, Share2, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, TALK_OPTIONS, type RoomView, type TalkTime } from '../../../shared/protocol';
import { Mask } from '../components/Mask';
import { Button, Logo, Modal, Pill, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Liar Game', text: `Tu es convoqué à Liar Game (table ${view.code}).`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <main className="paper">
      <div className="lobby">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <section className="code-panel">
          <span className="dossier">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code}`}>
            {view.code}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Convoquer des amis
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
              {copied ? 'Lien copié !' : 'Copier le lien'}
            </Button>
            <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code">
              QR
            </Button>
          </div>
        </section>

        <div className="lobby-grid">
          <section className="sheet">
            <div className="sheet-head">
              <h3>
                Convoqués <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
              </h3>
              {isHost && (
                <Button icon={<Bot size={18} />} disabled={seated.length >= MAX_PLAYERS} onClick={() => void send('room:addBot')}>
                  Ajouter un bot
                </Button>
              )}
            </div>
            <ul className="player-list">
              {seated.map((p, i) => (
                <motion.li key={p.id} className={cls('player-row', p.id === view.me && 'is-me')} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                  <Mask avatar={p.avatar} className="player-mask" />
                  <span className="player-name">
                    {p.name}
                    {p.id === view.me && <span className="muted"> (toi)</span>}
                  </span>
                  {p.isHost && (
                    <Pill tone="red">
                      <Crown size={12} /> Hôte
                    </Pill>
                  )}
                  {p.isBot && <Pill>Bot</Pill>}
                  {!p.connected && <Pill>Hors ligne</Pill>}
                  {isHost && p.id !== view.me && (
                    <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
                      <UserX size={18} />
                    </button>
                  )}
                </motion.li>
              ))}
              {Array.from({ length: Math.max(0, MIN_PLAYERS - seated.length) }, (_, i) => (
                <li key={`empty${i}`} className="player-row is-empty">
                  <span className="player-ghost">?</span>
                  <span className="player-name muted">En attente d'un joueur…</span>
                </li>
              ))}
            </ul>
            {spectators.length > 0 && <p className="muted small">Observateurs : {spectators.map((p) => p.name).join(', ')}</p>}
          </section>

          <section className="sheet">
            <div className="sheet-head">
              <h3>Règlement</h3>
              {!isHost && <span className="muted small">choisi par {host?.name ?? "l'hôte"}</span>}
            </div>
            <span className="field-label">Temps de discussion</span>
            <Segmented<TalkTime>
              label="Temps de discussion"
              value={view.settings.talk}
              disabled={!isHost}
              onChange={(talk) => void send('room:settings', { talk })}
              options={TALK_OPTIONS.map((t) => ({ value: t, label: t < 60 ? `${t} s` : t % 60 ? `${Math.floor(t / 60)} min ${t % 60}` : `${t / 60} min` }))}
            />
            <p className="muted small lobby-note">Le temps de parler, chuchoter et signer des pactes avant chaque vote. La table peut abréger si tout le monde est prêt.</p>
            <p className="muted small lobby-note">Le jeu est meilleur à partir de 5 joueurs : complète avec des bots si vous êtes peu.</p>
          </section>
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={seated.length < MIN_PLAYERS} onClick={() => void send('game:start')}>
              {seated.length < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs` : `Ouvrir la séance (${seated.length} joueurs)`}
            </Button>
          ) : (
            <div className="waiting">
              <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} ouvre la séance…
            </div>
          )}
          <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
            Nouveau ? Les règles en 1 minute
          </Button>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#efe9dc" fgColor="#14110f" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </main>
  );
}
