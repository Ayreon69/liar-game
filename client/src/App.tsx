import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { RulesModal } from './components/Rules';
import { Final } from './screens/Final';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';
import { useStore } from './store';

export function App() {
  const view = useStore((s) => s.view);
  const conn = useStore((s) => s.conn);
  const everConnected = useStore((s) => s.everConnected);
  const toast = useStore((s) => s.toast);

  return (
    <>
      {!view ? <Home /> : view.phase === 'lobby' ? <Lobby view={view} /> : view.phase === 'finished' ? <Final view={view} /> : <Table view={view} />}
      <RulesModal />
      {view && conn !== 'online' && everConnected && (
        <div className="conn-banner">
          <WifiOff size={16} /> Connexion perdue : reconnexion en cours…
        </div>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={`toast is-${toast.tone}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => useStore.setState({ toast: null })}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
