// Règles illustrées, lisibles en une minute.
import { useStore } from '../store';
import { Modal } from './Ui';

function Dots({ alive, out }: { alive: number; out: number }) {
  return (
    <span className="rule-dots" aria-hidden>
      {Array.from({ length: alive }, (_, i) => (
        <i key={`a${i}`} className="is-alive" />
      ))}
      {Array.from({ length: out }, (_, i) => (
        <i key={`o${i}`} className="is-out" />
      ))}
    </span>
  );
}

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles en 1 minute" wide>
      <div className="rules">
        <p className="rule-lead">
          Une question, deux réponses, un vote secret. <b>Seuls les moins nombreux survivent.</b> La question n'a aucune importance : tout se joue sur ce que les autres vont voter.
        </p>

        <section>
          <h3>1. La discussion</h3>
          <p>Parlez à toute la table, ou chuchotez à un seul joueur : tout le monde voit que vous chuchotez, personne ne lit quoi.</p>
          <p>
            Touchez un joueur pour lui proposer un <b>pacte</b> : voter le même camp. Rien ne vous oblige à le tenir.
          </p>
        </section>

        <section>
          <h3>2. L'isoloir</h3>
          <p>Le rideau tombe, plus un mot. Vous avez 15 secondes pour choisir A ou B, et vous pouvez changer d'avis jusqu'à sceller votre bulletin. Sans bulletin à temps, le sort choisit pour vous.</p>
        </section>

        <section>
          <h3>3. Le dépouillement</h3>
          <ul className="rule-cases">
            <li>
              <Dots alive={2} out={3} />
              <span>
                <b>2 contre 3 :</b> les 2 continuent, les 3 tombent.
              </span>
            </li>
            <li>
              <Dots alive={4} out={0} />
              <span>
                <b>Égalité ou unanimité :</b> pas de minorité, personne ne tombe. On revote sur une autre question.
              </span>
            </li>
          </ul>
          <p>Tous les pactes sont alors dévoilés, et les traîtres aussi.</p>
        </section>

        <section>
          <h3>La fin</h3>
          <p>
            La partie s'arrête quand il reste <b>un ou deux survivants</b> : à deux, plus personne ne peut être en minorité.
          </p>
        </section>

        <p className="rule-note">Ici, rien n'est noté à votre place : les votes passés disparaissent de l'écran. Souvenez-vous de qui vous a menti. Le procès-verbal complet n'est publié qu'à la fin.</p>
      </div>
    </Modal>
  );
}
