// Test de bout en bout : 3 humains (socket.io) + 4 bots jouent une partie complète sur le serveur compilé.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), LM_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

let audited = 0;
let reveals = 0;
let whispersSeen = 0;
const SECRET = 'code-rouge-confidentiel';

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, session: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(c, v);
    play(c);
  });
  socket.on('whisper:seen', () => whispersSeen++);
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Vérifie les secrets sur chaque état reçu. */
function audit(c, v) {
  const r = v.round;
  if (v.phase !== 'playing' || !r) return;
  audited++;
  const raw = JSON.stringify(v);
  if (r.phase !== 'reveal' && r.reveal) fail('dépouillement envoyé avant la fin du vote');
  if (r.phase !== 'reveal' && raw.includes('"ballots"')) fail('des bulletins circulent avant le dépouillement');
  if (v.minutes) fail('procès-verbal publié avant la fin de la partie');
  for (const p of r.pacts) if (p.from !== v.me && p.to !== v.me) fail("un pacte d'autrui est visible");
  for (const w of r.whispers) if (w.from !== v.me && w.to !== v.me) fail("un chuchotement d'autrui est visible");
  if (c.name === 'Chloé' && raw.includes(SECRET)) fail('Chloé lit un chuchotement qui ne lui est pas destiné');
  if (r.reveal) reveals++;
}

function play(c) {
  const v = c.view;
  if (!v || v.phase !== 'playing' || !v.round) return;
  const r = v.round;
  const ack = () => {};
  if (r.phase === 'reveal') {
    c.socket.emit('game:next', {}, ack);
    return;
  }
  if (!r.order.includes(v.me)) return;
  if (r.phase === 'talk') {
    if (!r.readyIds.includes(v.me) && Math.random() < 0.5) c.socket.emit('game:readyTalk', {}, ack);
    return;
  }
  if (!r.mine) c.socket.emit('game:vote', { side: Math.random() < 0.5 ? 'A' : 'B' }, ack);
  else if (!r.sealed) c.socket.emit('game:seal', {}, ack);
}

const a = client('Alice');
const b = client('Bob');
const d = client('Chloé');
await Promise.all([a, b, d].map((c) => new Promise((r) => c.socket.on('connect', r))));

const created = await a.call('room:create', { name: 'Alice', avatar: 'm1' });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const joined = await b.call('room:join', { code: code.toLowerCase(), name: 'Bob', avatar: 'm2' });
if (!joined.ok) fail(`jointure : ${joined.error}`);
b.session = joined.data;
const third = await d.call('room:join', { code, name: 'Chloé', avatar: 'm3' });
if (!third.ok) fail(`jointure : ${third.error}`);
for (let i = 0; i < 4; i++) await a.call('room:addBot');
const denied = await b.call('game:start');
if (denied.ok) fail('un invité ne devrait pas pouvoir lancer la partie');
const started = await a.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);
console.log(`✓ table ${code} lancée à 7 joueurs`);

// Alice chuchote à Bob, et Chloé ne doit voir que le fait qu'on chuchote.
const before = whispersSeen;
const w = await a.call('whisper', { to: b.session.playerId, text: SECRET });
if (!w.ok) fail(`chuchotement : ${w.error}`);
await new Promise((r) => setTimeout(r, 60));
if (whispersSeen <= before) fail("personne n'a vu qu'on chuchotait");
console.log('✓ chuchotement reçu par son seul destinataire, vu de loin par les autres');

// Bob se déconnecte puis revient avec son jeton : il doit retrouver sa place.
b.socket.disconnect();
await new Promise((r) => setTimeout(r, 100));
const b2 = client('Bob');
await new Promise((r) => b2.socket.on('connect', r));
const resumed = await b2.call('room:join', { code, ...b.session, resumeOnly: true });
if (!resumed.ok || resumed.data.playerId !== b.session.playerId) fail('reprise de session échouée');
console.log('✓ reconnexion de Bob sur sa place');

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (a.view?.phase === 'finished') {
      clearInterval(check);
      resolve();
    }
  }, 50);
});
if (audited === 0) fail("aucun état n'a été contrôlé");
if (reveals === 0) fail("aucun dépouillement n'a été contrôlé");
console.log(`✓ aucun secret dans les ${audited} états reçus`);
const final = a.view.final;
if (final.length !== 7) fail('il doit y avoir 7 joueurs au classement');
const survivors = final.filter((f) => f.survivor);
if (survivors.length < 1 || survivors.length > 2) fail('il doit rester 1 ou 2 survivants');
if (!a.view.minutes?.length) fail('le procès-verbal doit être publié en fin de partie');
console.log(`✓ partie terminée en ${a.view.minutes.length} manche(s), survivants : ${survivors.map((s) => s.name).join(', ')}`);

await a.call('game:restart');
await new Promise((r) => setTimeout(r, 100));
if (a.view.phase !== 'lobby') fail('retour au salon échoué');
console.log('✓ retour au salon pour une revanche');

a.socket.close();
b2.socket.close();
d.socket.close();
server.kill();
console.log('✓ test de bout en bout réussi');
process.exit(0);
