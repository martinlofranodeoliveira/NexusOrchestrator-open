import type { OperationsSnapshot } from '../operationsTypes.js';

interface FleetStatusBarProps {
  snapshot: OperationsSnapshot;
  onOpenBoard: () => void;
  onRefresh: () => void;
}

export function FleetStatusBar({ snapshot, onOpenBoard, onRefresh }: FleetStatusBarProps) {
  const fleet = snapshot.settings?.externalFleet;
  if (!fleet?.enabled) return null;
  const live = fleet.state === 'live';
  const activity = live ? (snapshot.runs?.active || 0) + (snapshot.runs?.preparing || 0) : 0;
  const label = live ? 'Conectado' : fleet.state === 'stale' ? 'Sinais desatualizados' : 'Fonte indisponível';

  return (
    <header className="fleet-status-bar" aria-label="Laboratório de código aberto">
      <div className="fleet-status-identity">
        <strong>NexusOrchestrator</strong>
        <span>Laboratório de código aberto</span>
      </div>
      <div className="fleet-status-summary">
        <span className={`fleet-connection fleet-connection-${fleet.state}`} role="status">{label}</span>
        <span>{activity} em atividade</span>
        <span>{snapshot.runs?.queued || 0} na fila</span>
      </div>
      <div className="fleet-status-actions">
        <button type="button" onClick={onOpenBoard}>Quadro de tarefas</button>
        <button type="button" onClick={onRefresh} aria-label="Atualizar estado do laboratório">Atualizar</button>
      </div>
      {!live && <p className="fleet-status-warning">A atividade atual dos agentes não foi confirmada.</p>}
    </header>
  );
}
