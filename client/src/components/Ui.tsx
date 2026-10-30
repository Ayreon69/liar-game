// Briques d'interface communes : boutons, fenêtres, tampon, logo et réactions.
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { cls } from '../lib/util';
import { useStore } from '../store';
import type { PlayerView } from '../../../shared/protocol';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'red';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} aria-label="Liar Game">
      <span className="logo-la">Liar</span> Game
    </div>
  );
}

/** Le tampon rouge : toujours un peu de travers, comme posé à la main. */
export function Stamp({ children, className, tilt = -6 }: { children: ReactNode; className?: string; tilt?: number }) {
  return (
    <div className={cls('stamp', className)} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      {children}
    </div>
  );
}

export function Pill({ tone, children }: { tone?: 'red' | 'ink'; children: ReactNode }) {
  return <span className={cls('pill', tone && `pill-${tone}`)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
}

export function Segmented<T extends string | number>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} className={cls('seg', o.value === value && 'is-on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className={cls('modal', wide && 'is-wide')}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2>{title}</h2>
              <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
                <X size={20} />
              </button>
            </header>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Les réactions passent en bas de l'écran, avec le nom de leur auteur, puis s'effacent. */
export function EmoteLayer({ players }: { players: PlayerView[] }) {
  const emotes = useStore((s) => s.emotes);
  return (
    <div className="emote-layer" aria-live="polite">
      <AnimatePresence>
        {emotes.map((e) => (
          <motion.div key={e.id} className="emote-line" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <b>{players.find((p) => p.id === e.playerId)?.name ?? '?'}</b> {e.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
