import { useEffect, useState } from 'react';

import { findAgentByNumericId } from '../../agentIds.js';
import { CHARACTER_SITTING_OFFSET_PX, TOOL_OVERLAY_VERTICAL_OFFSET } from '../../constants.js';
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js';
import type { BackendAgent, OperationalAgentState } from '../../operationalState.js';
import type { OfficeState } from '../engine/officeState.js';
import type { ToolActivity } from '../types.js';
import { CharacterState, TILE_SIZE } from '../types.js';

interface ToolOverlayProps {
  canManageAgents?: boolean;
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onCloseAgent: (id: number) => void;
  onEditAgent: (agentId: string) => void;
  alwaysShowOverlay: boolean;
  tasks?: any[];
  backendAgents?: BackendAgent[];
  operationalStates?: Record<number, OperationalAgentState>;
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
): string {
  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval';
      return activeTool.status;
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return lastTool.status;
    }
  }

  return 'Idle';
}

function formatProviderLabel(provider: string | null | undefined): string {
  switch (String(provider || '').trim().toLowerCase()) {
    case 'opencode':
    case 'opencode-go':
      return 'OPENCODE';
    case 'codex':
      return 'CODEX';
    case 'local':
      return 'LOCAL';
    case 'azure':
    case 'azure_openai':
    case 'azure-openai':
      return 'AZURE OPENAI';
    case 'anthropic':
      return 'ANTHROPIC';
    case 'openai':
      return 'OPENAI';
    case 'xai':
      return 'XAI';
    case 'openai_compat':
      return 'OPENAI-COMPAT';
    case 'gemini':
    default:
      return 'GEMINI';
  }
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
  onEditAgent,
  canManageAgents = true,
  alwaysShowOverlay,
  tasks = [],
  backendAgents = [],
  operationalStates = {},
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;

  // All character IDs
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];

  const whiteboard = layout.furniture.find((f: any) => f.type.toUpperCase() === 'WHITEBOARD');
  // Ajuste fino do Y (-10 em vez de -22 ou -76) para que os post-its não flutuem acima da parede
  const wbX = whiteboard ? (deviceOffsetX + (whiteboard.col * 16 + 6) * zoom) / dpr : 0;
  const wbY = whiteboard ? (deviceOffsetY + (whiteboard.row * 16 - 10) * zoom) / dpr : 0;

  const getStickyRotation = (value: string) => {
    let hash = 0;
    for (const char of value) {
      hash = (hash * 31 + char.charCodeAt(0)) % 9973;
    }
    return (hash % 21) - 10;
  };

  return (
    <>
      {whiteboard && tasks.length > 0 && (
        <div style={{
          position: 'absolute',
          left: wbX,
          top: wbY,
          width: 36 * zoom / dpr,
          height: 16 * zoom / dpr,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1 * zoom / dpr,
          padding: 1 * zoom / dpr,
          pointerEvents: 'none',
          zIndex: 50,
          overflow: 'hidden'
        }}>
          {tasks.map((t: any) => {
            const taskStatus = String(t.state || t.status || '').trim();
            return (
              <div key={t.id} title={`${t.id}: ${t.title}`} style={{
                width: 3 * zoom / dpr, height: 3 * zoom / dpr, // Nano post-its
                backgroundColor:
                  taskStatus === 'done'
                    ? '#4CAF50'
                    : taskStatus === 'in_review'
                      ? '#4FC3F7'
                      : taskStatus === 'in_progress'
                        ? '#FFC107'
                        : taskStatus === 'ready'
                          ? '#95f3ae'
                          : taskStatus === 'blocked'
                            ? '#F44336'
                            : '#b0bec5',
                border: '0.2px solid rgba(255,255,255,0.5)', 
                boxShadow: '0.5px 0.5px 1px rgba(0,0,0,0.8)',
                opacity: 0.9,
                display: 'block',
                transform: `rotate(${getStickyRotation(String(t.id || t.title || 'task'))}deg)`
              }} />
            );
          })}
        </div>
      )}
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const isSub = ch.isSubagent;

        // Only show for hovered or selected agents (unless always-show is on)
        if (!alwaysShowOverlay && !isSelected && !isHovered) return null;

        // Position above character
        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY =
          (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr;

        // Get activity text
        const subHasPermission = isSub && ch.bubbleType === 'permission';
        const operationalState = operationalStates[id];
        let activityText: string;
        if (isSub) {
          if (subHasPermission) {
            activityText = 'Needs approval';
          } else {
            const sub = subagentCharacters.find((s) => s.id === id);
            activityText = sub ? sub.label : 'Subtask';
          }
        } else {
          activityText =
            operationalState?.description || getActivityText(id, agentTools, ch.isActive);
        }

        // Determine dot color
        const tools = agentTools[id];
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done);
        const hasActiveTools = tools?.some((t) => !t.done);
        const isActive = ch.isActive;
        const backendAgent = findAgentByNumericId(backendAgents, id);

        let dotColor: string | null = null;
        if (hasPermission) {
          dotColor = 'var(--pixel-status-permission)';
        } else if (operationalState) {
          dotColor = operationalState.accentColor;
        } else if (isActive && hasActiveTools) {
          dotColor = 'var(--pixel-status-active)';
        }

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 24,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: isSelected ? 'auto' : 'none',
              opacity: alwaysShowOverlay && !isSelected && !isHovered ? (isSub ? 0.5 : 0.75) : 1,
              zIndex: isSelected ? 'var(--pixel-overlay-selected-z)' : 'var(--pixel-overlay-z)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'var(--pixel-bg)',
                border: isSelected
                  ? '2px solid var(--pixel-border-light)'
                  : '2px solid var(--pixel-border)',
                borderRadius: 0,
                padding: isSelected ? '3px 6px 3px 8px' : '3px 8px',
                boxShadow: 'var(--pixel-shadow)',
                whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
            >
              {dotColor && (
                <span
                  className={
                    isActive && !hasPermission && operationalState?.kind !== 'idle'
                      ? 'pixel-agents-pulse'
                      : undefined
                  }
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ overflow: 'hidden' }}>
                {!isSub && operationalState && (
                  <div style={{ marginBottom: 3 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '11px',
                        letterSpacing: 0.6,
                        padding: '1px 5px',
                        border: `1px solid ${operationalState.accentColor}`,
                        background: operationalState.badgeBackground,
                        color: operationalState.accentColor,
                      }}
                    >
                      {operationalState.label}
                    </span>
                  </div>
                )}
                <span
                  style={{
                    fontSize: isSub ? '20px' : '22px',
                    fontStyle: isSub ? 'italic' : undefined,
                    color: 'var(--vscode-foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                  }}
                >
                  {activityText}
                </span>
                {ch.folderName && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: '16px',
                        color: 'var(--pixel-text-dim)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block',
                      }}
                    >
                      {ch.folderName}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--pixel-accent)', opacity: 0.8 }}>
                      {formatProviderLabel(backendAgent?.currentProvider || backendAgent?.llmProvider || 'gemini')} · {backendAgent?.currentModel || backendAgent?.model || 'gemini-3.1-flash-lite-preview'}{(backendAgent?.currentReasoningEffort || backendAgent?.reasoningEffort) ? ` · ${backendAgent.currentReasoningEffort || backendAgent.reasoningEffort}` : ''}{backendAgent?.fallbackActive ? ` · fallback +${Math.max(1, Number(backendAgent.fallbackDepth || 1))}` : ''}
                    </span>
                  </div>
                )}
              </div>
              {canManageAgents && isSelected && !isSub && backendAgent && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditAgent(backendAgent.id);
                  }}
                  title="Tune agent"
                  style={{
                    background: 'none',
                    border: '1px solid var(--pixel-border)',
                    color: 'var(--pixel-accent)',
                    cursor: 'pointer',
                    padding: '1px 5px',
                    fontSize: '11px',
                    lineHeight: 1.2,
                    marginLeft: 4,
                    flexShrink: 0,
                  }}
                >
                  tune
                </button>
              )}
              {canManageAgents && isSelected && !isSub && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseAgent(id);
                  }}
                  title="Close agent"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--pixel-close-text)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: '26px',
                    lineHeight: 1,
                    marginLeft: 2,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-text)';
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
