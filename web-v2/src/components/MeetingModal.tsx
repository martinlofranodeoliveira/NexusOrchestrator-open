import { useState } from 'react';

import { getAgentDisplayName } from '../agentDisplay.js';
import type { BackendAgent } from '../operationalState.js';
import './MeetingModal.css';

interface MeetingModalProps {
  onClose: () => void;
  onStart: (topic: string, agentIds: string[]) => void;
  agents: BackendAgent[];
  currentInstanceLabel?: string | null;
}

export function MeetingModal({
  onClose,
  onStart,
  agents,
  currentInstanceLabel = null,
}: MeetingModalProps) {
  const [topic, setTopic] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleToggleAgent = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((agentId) => agentId !== id) : [...prev, id],
    );
  };

  const handleStart = () => {
    if (!topic.trim()) {
      alert('A reuniao precisa de um topico!');
      return;
    }
    if (selectedIds.length === 0) {
      alert('Selecione pelo menos um agente para a reuniao!');
      return;
    }
    onStart(topic, selectedIds);
  };

  const availableAgents = agents.filter((agent) => agent.role !== 'ceo');

  return (
    <div className="meeting-modal-overlay">
      <div className="meeting-modal">
        <div className="meeting-header">
          <div className="meeting-title">SALA DE REUNIAO - CONVOCAR EQUIPE</div>
          <button className="meeting-close" onClick={onClose}>[X]</button>
        </div>

        <div className="meeting-body">
          {currentInstanceLabel && (
            <div className="meeting-instance-note">Instancia local: {currentInstanceLabel}</div>
          )}

          <div className="meeting-form-group">
            <label>TOPICO DA REUNIAO</label>
            <input
              type="text"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Ex: Discutir e distribuir tarefas do backlog..."
            />
          </div>

          <div className="meeting-form-group">
            <label>SELECIONE OS PARTICIPANTES</label>
            <div className="meeting-checkbox-group">
              {availableAgents.map((agent) => (
                <label key={agent.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(agent.id)}
                    onChange={() => handleToggleAgent(agent.id)}
                  />
                  {getAgentDisplayName(agent)} ({agent.role}) - Status: {agent.status}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="meeting-footer">
          <button className="meeting-btn-start" onClick={handleStart}>INICIAR REUNIAO</button>
        </div>
      </div>
    </div>
  );
}
