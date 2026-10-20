import { useEffect, useMemo, useRef, useState } from 'react';

import { getAgentDisplayName } from '../agentDisplay.js';
import { getNumericAgentId } from '../agentIds.js';
import type { BackendAgent, OperationalAgentState } from '../operationalState.js';

interface LiveLogEntry {
  seq: number;
  agentId: number;
  backendId: string;
  text: string;
}

interface LiveLogDockProps {
  entries: LiveLogEntry[];
  agents: BackendAgent[];
  operationalStates?: Record<number, OperationalAgentState>;
  onOpenAgent: (agentId: number) => void;
}

function getAgentLabel(entry: LiveLogEntry, agents: BackendAgent[]): string {
  const byBackendId = agents.find((agent) => agent.id === entry.backendId);
  if (byBackendId) return getAgentDisplayName(byBackendId);

  const byNumericId = agents.find(
    (agent, index) => getNumericAgentId(agent.id, index) === entry.agentId,
  );
  if (byNumericId) return getAgentDisplayName(byNumericId);

  return entry.backendId || `Agent ${entry.agentId}`;
}

export function LiveLogDock({
  entries,
  agents,
  operationalStates = {},
  onOpenAgent,
}: LiveLogDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recentEntries = useMemo(() => entries.slice(-80), [entries]);

  useEffect(() => {
    if (collapsed) return;
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [collapsed, recentEntries]);

  return (
    <div
      style={{
        position: 'absolute',
        right: 10,
        bottom: 10,
        width: collapsed ? 240 : 460,
        maxWidth: 'calc(100vw - 20px)',
        zIndex: 90,
        background: 'rgba(12, 12, 12, 0.96)',
        border: '2px solid var(--pixel-border)',
        boxShadow: 'var(--pixel-shadow)',
        color: '#d7ffe4',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: collapsed ? 'none' : '2px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        <div style={{ fontSize: '22px', color: '#fff' }}>Live Logs</div>
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          style={{
            padding: '4px 8px',
            fontSize: '20px',
            cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
          }}
        >
          {collapsed ? 'Open' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <div
          ref={bodyRef}
          style={{
            maxHeight: 260,
            overflowY: 'auto',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {recentEntries.length === 0 && (
            <div style={{ fontSize: '18px', opacity: 0.75 }}>Ainda sem logs em tempo real.</div>
          )}

          {recentEntries.map((entry) => {
            const operationalState = operationalStates[entry.agentId];
            return (
              <button
                key={entry.seq}
                onClick={() => onOpenAgent(entry.agentId)}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${operationalState?.accentColor || 'rgba(255,255,255,0.08)'}`,
                  background: 'rgba(255,255,255,0.03)',
                  color: 'inherit',
                  padding: '6px 8px',
                  cursor: 'pointer',
                }}
                title="Abrir terminal do agente"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: '16px', color: '#9ad9ff' }}>
                    {getAgentLabel(entry, agents)}
                  </div>
                  {operationalState && (
                    <span
                      style={{
                        fontSize: '11px',
                        letterSpacing: 0.6,
                        padding: '2px 6px',
                        border: `1px solid ${operationalState.accentColor}`,
                        background: operationalState.badgeBackground,
                        color: operationalState.accentColor,
                      }}
                    >
                      {operationalState.label}
                    </span>
                  )}
                </div>

                {operationalState && (
                  <div
                    style={{
                      fontSize: '12px',
                      lineHeight: 1.25,
                      opacity: 0.78,
                      marginBottom: 4,
                    }}
                  >
                    {operationalState.description}
                  </div>
                )}

                <div
                  style={{
                    fontSize: '15px',
                    lineHeight: 1.3,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.text}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
