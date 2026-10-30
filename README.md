# Liar Game

**Vote en secret. Seuls les moins nombreux survivent.**

👉 **Jouer : https://liar-game-nh9k.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu multijoueur en ligne de négociation et de trahison, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après le jeu de la minorité du manga *Liar Game* de Shinobu Kaitani (projet de fans, non officiel, avec ses propres visuels).

## Règles en bref

- De 3 à 16 joueurs, et le jeu est meilleur à partir de 5.
- Une question, deux réponses. Le contenu de la question n'a aucune importance : seul le nombre de bulletins compte.
- **Discussion :** on parle à toute la table ou on chuchote à un joueur. Tout le monde voit qu'on chuchote, personne ne lit quoi. On peut signer un **pacte** sur un camp, sans aucune obligation de le tenir.
- **Isoloir :** plus un mot, 15 secondes pour voter A ou B. Sans bulletin à temps, le sort choisit.
- **Dépouillement :** le plus petit camp continue, l'autre tombe. Les pactes sont dévoilés, et les traîtres avec.
- **Égalité ou unanimité :** pas de minorité, personne ne tombe, on revote sur une autre question.
- **Fin :** la partie s'arrête à un ou deux survivants, car à deux personne ne peut plus être en minorité.

La source ne détaille pas tous les cas : le traitement de l'égalité, de l'unanimité et la fin de partie sont des choix de ce jeu. Les pactes et les chuchotements sont des ajouts qui transposent les négociations de l'œuvre en ligne.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Bots qui parlent, chuchotent, proposent des pactes et mentent, sans jamais voir un bulletin
- Aucune aide à la mémoire : ni décompte pendant le vote, ni historique des votes avant la fin, et les chuchotements disparaissent à chaque manche
- Procès-verbal complet et distinctions publiés à la fin de la partie seulement
- Reprise automatique après une coupure, vote au hasard si un joueur s'absente, observateurs
- Sons synthétisés et vibrations

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3050
npm run dev:client   # interface sur http://localhost:5176
npm test             # moteur de jeu + centaines de parties simulées
npm run build && npm run e2e   # partie complète avec de vrais clients connectés
```

`LM_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur et verdict du vote (`verdict`)
- `server/` : Express + Socket.IO, moteur de table (`room.ts`), bots (`bots.ts`), questions (`questions.ts`). Le serveur fait autorité : un bulletin, un pacte ou un chuchotement ne sort que vers ses auteurs jusqu'au dépouillement
- `client/` : React + Vite + Framer Motion. Masques en SVG (`components/Mask.tsx`), isoloir dans `screens/Table.tsx`, dépouillement dans `screens/Reveal.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
