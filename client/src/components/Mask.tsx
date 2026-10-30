// Les masques des joueurs : douze visages de papier, tracés à l'encre, tous un peu inquiétants.
import { cls } from '../lib/util';

type Eyes = 'dots' | 'slits' | 'cross' | 'hollow' | 'sad' | 'wink';
type Mouth = 'line' | 'smile' | 'frown' | 'zig' | 'o' | 'none';
type Mark = 'none' | 'tear' | 'dot' | 'stripe' | 'brow';

const FACES: Record<string, [Eyes, Mouth, Mark, string]> = {
  m1: ['dots', 'line', 'none', 'Le Muet'],
  m2: ['slits', 'smile', 'none', 'Le Rieur'],
  m3: ['cross', 'zig', 'none', "L'Absent"],
  m4: ['hollow', 'o', 'none', "L'Effaré"],
  m5: ['sad', 'frown', 'tear', 'Le Pleureur'],
  m6: ['wink', 'smile', 'none', 'Le Complice'],
  m7: ['dots', 'none', 'dot', 'Le Sage'],
  m8: ['slits', 'line', 'stripe', 'Le Soldat'],
  m9: ['hollow', 'zig', 'stripe', 'Le Fou'],
  m10: ['sad', 'smile', 'brow', 'Le Menteur'],
  m11: ['cross', 'o', 'dot', 'Le Revenant'],
  m12: ['wink', 'frown', 'brow', 'Le Traître'],
};

export const MASK_LABELS: Record<string, string> = Object.fromEntries(Object.entries(FACES).map(([k, v]) => [k, v[3]]));

function EyePair({ kind }: { kind: Eyes }) {
  const one = (x: number, flip = false) => {
    switch (kind) {
      case 'dots':
        return <circle cx={x} cy={19} r={2.4} fill="currentColor" />;
      case 'slits':
        return <path d={`M${x - 4} 19.5 L${x + 4} ${flip ? 21 : 18}`} />;
      case 'cross':
        return <path d={`M${x - 3} 16.5l6 6M${x + 3} 16.5l-6 6`} />;
      case 'hollow':
        return <circle cx={x} cy={19} r={3.6} fill="none" />;
      case 'sad':
        return <path d={`M${x - 4} ${flip ? 18 : 21}Q${x} 15.5 ${x + 4} ${flip ? 21 : 18}`} fill="none" />;
      case 'wink':
        return flip ? <circle cx={x} cy={19} r={2.4} fill="currentColor" /> : <path d={`M${x - 4} 20q4 -4 8 0`} fill="none" />;
    }
  };
  return (
    <>
      {one(13)}
      {one(27, true)}
    </>
  );
}

function MouthShape({ kind }: { kind: Mouth }) {
  switch (kind) {
    case 'line':
      return <path d="M14 32h12" />;
    case 'smile':
      return <path d="M12 29q8 8 16 0" fill="none" />;
    case 'frown':
      return <path d="M13 34q7 -6 14 0" fill="none" />;
    case 'zig':
      return <path d="M12 32l3 -2 3 3 4 -3 3 3 3 -2" fill="none" />;
    case 'o':
      return <ellipse cx={20} cy={32} rx={3} ry={3.8} fill="none" />;
    case 'none':
      return null;
  }
}

function MarkShape({ kind }: { kind: Mark }) {
  switch (kind) {
    case 'tear':
      return <path d="M27 24q-1.6 3 0 4.4q1.6 -1.4 0 -4.4z" fill="currentColor" stroke="none" />;
    case 'dot':
      return <circle cx={20} cy={10} r={1.8} fill="var(--red)" stroke="none" />;
    case 'stripe':
      return <path d="M9 11l22 26" strokeWidth={1.2} />;
    case 'brow':
      return <path d="M8 13l9 2M32 13l-9 2" />;
    case 'none':
      return null;
  }
}

export function Mask({ avatar, className, out }: { avatar: string; className?: string; out?: boolean }) {
  const [eyes, mouth, mark, label] = FACES[avatar] ?? FACES.m1;
  return (
    <svg className={cls('mask', out && 'is-out', className)} viewBox="0 0 40 46" role="img" aria-label={label} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path className="mask-face" d="M20 2C32 2 37 10 37 20C37 33 29 44 20 44C11 44 3 33 3 20C3 10 8 2 20 2Z" />
      <EyePair kind={eyes} />
      <MouthShape kind={mouth} />
      <MarkShape kind={mark} />
    </svg>
  );
}
