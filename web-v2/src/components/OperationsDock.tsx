import { useMemo, useState } from 'react';
import type {
  OperationsAttentionTask,
  OperationsOpencodeReviewGateStatus,
  OperationsRoomSummary,
  OperationsOpencodeValidatorStatus,
  OperationsSnapshot,
} from '../operationsTypes.js';

const BOTTOM_TOOLBAR_CLEARANCE_PX = 76;
export type {
  OperationsAttentionTask,
  OperationsLaneEvent,
  OperationsLaneRecord,
  OperationsOpencodeValidatorStatus,
  OperationsSnapshot,
} from '../operationsTypes.js';

interface OperationsDockProps {
  snapshot: OperationsSnapshot | null;
  onOpenKanban: () => void;
}

function formatDurationMs(durationMs: number | null | undefined): string {
  if (!Number.isFinite(durationMs)) return 'sem histórico';
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m${seconds ? ` ${seconds}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ''}`;
}

function formatOpencodeValidatorStatus(
  status: OperationsOpencodeValidatorStatus | null | undefined,
  gate: OperationsOpencodeReviewGateStatus | null | undefined,
): string {
  if (!status) return 'OpenCode: sem snapshot';
  if (status.removed) return 'Validador externo removido';
  const parts = [];
  parts.push(status.enabled ? 'OpenCode on' : 'OpenCode off');
  if (status.enabled) {
    if (!status.available) {
      parts.push('bin missing');
    } else if (!status.ready) {
      parts.push('setup pendente');
    } else {
      parts.push('ready');
    }
  } else if (status.available) {
    parts.push('bin ok');
  }
  if (status.defaultModel) parts.push(status.defaultModel);
  if (status.defaultAgent) parts.push(`agent ${status.defaultAgent}`);
  if (gate?.enabled) {
    parts.push(`gate ${gate.mode || 'advisory'}`);
  } else {
    parts.push('gate off');
  }
  return parts.join(' · ');
}

function getSeverityColor(severity: OperationsAttentionTask['severity'] | undefined): string {
  switch (severity) {
    case 'critical':
      return '#ff8f8f';
    case 'high':
      return '#ffcb6b';
    case 'medium':
      return '#7fd4ff';
    case 'info':
      return '#95f3ae';
    default:
      return 'rgba(255,255,255,0.25)';
  }
}

function getLaneStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'queued':
      return 'NA FILA';
    case 'preparing_workspace':
      return 'PREPARANDO';
    case 'running':
      return 'RODANDO';
    case 'integrating':
      return 'INTEGRANDO';
    case 'retry_scheduled':
      return 'RECUPERANDO';
    case 'completed':
      return 'CONCLUIDA';
    case 'failed':
      return 'FALHOU';
    case 'cancelled':
      return 'CANCELADA';
    default:
      return (state || 'desconhecida').toUpperCase();
  }
}

function getLaneStateColor(state: string | null | undefined): string {
  switch (state) {
    case 'running':
      return '#7fd4ff';
    case 'integrating':
      return '#95f3ae';
    case 'preparing_workspace':
      return '#f2d98a';
    case 'queued':
    case 'retry_scheduled':
      return '#ffcb6b';
    case 'failed':
      return '#ff8f8f';
    case 'completed':
      return '#95f3ae';
    default:
      return 'rgba(255,255,255,0.25)';
  }
}

function formatIsoAge(value: string | null | undefined): string {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return 'sem horario';
  return `${formatDurationMs(Math.max(0, Date.now() - parsed))} atras`;
}

function formatLaneEventLabel(eventName: string | null | undefined): string {
  const value = String(eventName || '').trim();
  if (!value) return 'sem evento';

  switch (value) {
    case 'lane.started':
      return 'lane.started';
    case 'lane.ready':
      return 'lane.ready';
    case 'lane.prompt_misdelivery':
      return 'lane.prompt_misdelivery';
    case 'lane.blocked':
      return 'lane.blocked';
    case 'lane.green':
      return 'lane.green';
    case 'lane.commit.created':
      return 'lane.commit.created';
    case 'lane.merge.ready':
      return 'lane.merge.ready';
    case 'lane.finished':
      return 'lane.finished';
    case 'lane.failed':
      return 'lane.failed';
    case 'lane.reconciled':
      return 'lane.reconciled';
    case 'lane.superseded':
      return 'lane.superseded';
    case 'branch.stale_against_main':
      return 'branch.stale_against_main';
    case 'lane.closed':
      return 'lane.closed';
    default:
      return value;
  }
}

function describeReason(task: OperationsAttentionTask): string {
  switch (task.reason) {
    case 'stalled_review':
      return `review sem execução há ${formatDurationMs(task.lastActivityAgeMs)}`;
    case 'stalled_execution':
      return `execução sem sinais há ${formatDurationMs(task.lastActivityAgeMs)}`;
    case 'active_without_assignee':
      return 'card ativo sem assignee';
    case 'awaiting_resume':
      return `aguardando retomada há ${formatDurationMs(task.lastActivityAgeMs)}`;
    case 'silent_review':
      return `review ainda rodando, mas sem logs há ${formatDurationMs(task.lastActivityAgeMs)}`;
    case 'silent_execution':
      return `execução ainda viva, mas sem logs há ${formatDurationMs(task.lastActivityAgeMs)}`;
    case 'queued':
      return 'na fila de execução';
    default:
      return task.execution.running ? 'executando agora' : 'monitorando';
  }
}

export function OperationsDock({ snapshot, onOpenKanban }: OperationsDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const attentionTasks = useMemo(
    () =>
      (snapshot?.attention?.tasks || []).filter(
        (task) => task.reason !== 'running' && task.reason !== 'ok',
      ),
    [snapshot],
  );
  const activeLanes = useMemo(
    () =>
      (snapshot?.lanes?.agents || []).filter(
        (lane) => !['completed', 'failed', 'cancelled'].includes(lane.state),
      ),
    [snapshot],
  );
  const recentLaneFailures = useMemo(
    () => snapshot?.lanes?.recentFailures || [],
    [snapshot],
  );
  const roomItems = useMemo(
    () => snapshot?.rooms?.items || [],
    [snapshot],
  );

  const healthy = snapshot?.attention?.healthy ?? false;
  const flaggedCount = snapshot?.attention?.flaggedCount ?? 0;
  const criticalCount = snapshot?.attention?.criticalCount ?? 0;
  const activeWithoutAssigneeCount = snapshot?.attention?.activeWithoutAssigneeCount ?? 0;
  const waitingWithoutExecutionCount = snapshot?.attention?.waitingWithoutExecutionCount ?? 0;
  const queuedCount = snapshot?.attention?.queuedCount ?? 0;
  const activeLaneCount = snapshot?.lanes?.active ?? 0;
  const queuedLaneCount = snapshot?.lanes?.byState?.queued ?? 0;
  const preparingLaneCount = snapshot?.lanes?.byState?.preparing_workspace ?? 0;
  const retryLaneCount = snapshot?.lanes?.byState?.retry_scheduled ?? 0;
  const roleCellRoomCount = snapshot?.rooms?.byTopology?.role_cells ?? 0;
  const boardProvider = snapshot?.settings?.boardProvider === 'github' ? 'GitHub' : 'Local';
  const opencodeValidator = snapshot?.settings?.opencodeValidator;
  const opencodeReviewGate = snapshot?.settings?.opencodeReviewGate;

  const formatRoomRoleSummary = (room: OperationsRoomSummary): string => {
    const configuredRoles = Object.entries(room.roles || {})
      .map(([role, count]) => `${role} x${count}`)
      .join(', ');
    if (configuredRoles) return configuredRoles;
    if (room.specializationRole && Number.isFinite(room.replicaTarget || room.configuredSlots)) {
      return `${room.specializationRole} x${room.replicaTarget || room.configuredSlots}`;
    }
    return room.specializationRole || 'mixed';
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 10,
        bottom: BOTTOM_TOOLBAR_CLEARANCE_PX,
        width: collapsed ? 240 : 380,
        maxWidth: 'calc(100vw - 20px)',
        maxHeight: `calc(100vh - ${BOTTOM_TOOLBAR_CLEARANCE_PX + 16}px)`,
        zIndex: 90,
        background: 'rgba(12, 12, 12, 0.96)',
        border: '2px solid var(--pixel-border)',
        boxShadow: 'var(--pixel-shadow)',
        color: '#d7ffe4',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom: collapsed ? 'none' : '2px solid rgba(255,255,255,0.08)',
          background: healthy ? 'rgba(90, 200, 140, 0.14)' : 'rgba(255, 180, 90, 0.14)',
        }}
      >
        <div>
          <div style={{ fontSize: '22px', color: '#fff' }}>Ops Status</div>
          <div style={{ fontSize: '14px', opacity: 0.8 }}>
            {healthy ? 'Autonomia saudável' : 'Atenção operacional'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {!collapsed && (
            <button
              onClick={onOpenKanban}
              style={{
                padding: '4px 8px',
                fontSize: '18px',
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
              }}
            >
              Kanban
            </button>
          )}
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            style={{
              padding: '4px 8px',
              fontSize: '18px',
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
            }}
          >
            {collapsed ? 'Open' : 'Hide'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          style={{
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflowY: 'auto',
          }}
        >
          {!snapshot && <div style={{ fontSize: '18px', opacity: 0.75 }}>Carregando snapshot operacional.</div>}

          {snapshot && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: '16px' }}>
                  Agents: {snapshot.agents?.total ?? 0}
                  <br />
                  Runs: {snapshot.runs?.active ?? 0}/{snapshot.runs?.preparing ?? 0}/
                  {snapshot.runs?.queued ?? 0}
                </div>
                <div style={{ fontSize: '16px' }}>
                  Ready: {snapshot.tasks?.byStatus?.ready ?? 0}
                  <br />
                  Review: {snapshot.tasks?.byStatus?.in_review ?? 0}
                  <br />
                  Admin: {snapshot.tasks?.byStatus?.pendente_admin ?? 0}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                  fontSize: '15px',
                }}
              >
                <div>Críticos: {criticalCount}</div>
                <div>Suspeitos: {flaggedCount}</div>
                <div>Sem assignee: {activeWithoutAssigneeCount}</div>
                <div>Esperando retomada: {waitingWithoutExecutionCount}</div>
                <div>Na fila: {queuedCount}</div>
              </div>

              <div
                style={{
                  fontSize: '15px',
                  opacity: 0.78,
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: 8,
                }}
              >
                Watchdog: {formatDurationMs(snapshot.settings?.activeTaskStaleMs)} ativo /{' '}
                {formatDurationMs(snapshot.settings?.reviewTaskStaleMs)} review
              </div>

              <div
                style={{
                  fontSize: '15px',
                  opacity: 0.78,
                }}
              >
                Rooms: {snapshot.rooms?.totalConfigured ?? 0}
                {roleCellRoomCount > 0 ? ` · role cells ${roleCellRoomCount}` : ''}
                {snapshot.settings?.builtinRoomTopology
                  ? ` · topo ${snapshot.settings.builtinRoomTopology}`
                  : ''}
              </div>

              <div
                style={{
                  fontSize: '15px',
                  opacity: 0.78,
                }}
              >
                Lanes: {activeLaneCount} ativas · preparando {preparingLaneCount} · fila{' '}
                {queuedLaneCount} · recovery {retryLaneCount}
              </div>

              <div
                style={{
                  fontSize: '15px',
                  opacity: 0.78,
                }}
              >
                Board: {boardProvider}
                {snapshot.settings?.projectSyncEnabled ? ' · Project sync on' : ' · Project sync off'}
                {snapshot.settings?.bootstrapDemoTasksEnabled === false
                  ? ' · demo seed off'
                  : ''}
              </div>

              <div
                style={{
                  fontSize: '15px',
                  opacity: 0.78,
                }}
              >
                {formatOpencodeValidatorStatus(opencodeValidator, opencodeReviewGate)}
              </div>

              <div
                style={{
                  fontSize: '15px',
                  opacity: 0.78,
                }}
              >
                Runner:{' '}
                {snapshot.settings?.ralphExtensionActive
                  ? 'Ralph experimental'
                  : 'Gemini nativo'}
                {snapshot.settings?.ralphExtensionDisabledReason
                  ? ` · fallback: ${snapshot.settings.ralphExtensionDisabledReason}`
                  : ''}
              </div>

              <div
                style={{
                  fontSize: '15px',
                  opacity: 0.78,
                }}
              >
                Penalidade de reexecucao: {formatDurationMs(snapshot.settings?.primaryTaskFailurePenaltyWindowMs)}
              </div>

              {roomItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '15px', opacity: 0.82 }}>Salas interligadas</div>
                  {roomItems.map((room) => (
                    <div
                      key={room.id}
                      style={{
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '6px 8px',
                      }}
                    >
                      <div style={{ fontSize: '16px', color: '#fff', marginBottom: 2 }}>
                        {room.name}
                        {room.specializationRole ? ` · ${room.specializationRole}` : ''}
                        {Number.isFinite(room.occupants) &&
                        Number.isFinite(room.replicaTarget || room.configuredSlots)
                          ? ` · ${room.occupants}/${room.replicaTarget || room.configuredSlots}`
                          : ''}
                      </div>
                      <div style={{ fontSize: '14px', opacity: 0.82 }}>
                        {room.team} · andar {room.floor}
                        {room.topology ? ` · ${room.topology}` : ''}
                        {room.archetypeId ? ` · archetype ${room.archetypeId}` : ''}
                      </div>
                      <div style={{ fontSize: '14px', opacity: 0.72 }}>
                        {formatRoomRoleSummary(room)}
                        {room.interlinkedRoomIds?.length
                          ? ` · links ${room.interlinkedRoomIds.length}`
                          : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeLanes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '15px', opacity: 0.82 }}>Lanes ativas</div>
                  {activeLanes.slice(0, 4).map((lane) => (
                    <div
                      key={lane.laneId}
                      style={{
                        border: `1px solid ${getLaneStateColor(lane.state)}`,
                        background: 'rgba(255,255,255,0.03)',
                        padding: '6px 8px',
                      }}
                    >
                      <div style={{ fontSize: '16px', color: '#fff', marginBottom: 2 }}>
                        {lane.agentName} · {getLaneStateLabel(lane.state)}
                        {lane.taskId ? ` · ${lane.taskId}` : ''}
                      </div>
                      <div style={{ fontSize: '15px', color: '#d7ffe4', marginBottom: 2 }}>
                        {lane.taskTitle || lane.detail || 'Sem titulo operacional'}
                      </div>
                      <div style={{ fontSize: '14px', opacity: 0.82 }}>
                        {lane.events?.length
                          ? `${formatLaneEventLabel(lane.events[lane.events.length - 1]?.event)} · `
                          : ''}
                        {lane.packet?.phase ? `${lane.packet.phase} · ` : ''}
                        {lane.requestKind}
                        {lane.retryCount > 0 ? ` · retry ${lane.retryCount}` : ''}
                        {lane.commandRecoveryCount > 0
                          ? ` · shell ${lane.commandRecoveryCount}`
                          : ''}
                        {` · ${formatIsoAge(lane.updatedAt)}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {recentLaneFailures.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '15px', opacity: 0.82 }}>Falhas recentes</div>
                  {recentLaneFailures.slice(0, 4).map((lane) => (
                    <div
                      key={`${lane.laneId}:${lane.updatedAt}`}
                      style={{
                        border: `1px solid ${getLaneStateColor('failed')}`,
                        background: 'rgba(255,255,255,0.03)',
                        padding: '6px 8px',
                      }}
                    >
                      <div style={{ fontSize: '16px', color: '#fff', marginBottom: 2 }}>
                        {lane.agentName}
                        {lane.taskId ? ` · ${lane.taskId}` : ''}
                        {lane.failureClass ? ` · ${lane.failureClass}` : ''}
                      </div>
                      <div style={{ fontSize: '15px', color: '#d7ffe4', marginBottom: 2 }}>
                        {lane.failureMessage || lane.detail || 'Falha operacional sem detalhe'}
                      </div>
                      <div style={{ fontSize: '14px', opacity: 0.82 }}>
                        {lane.recovery?.scenario ? `${lane.recovery.scenario} · ` : ''}
                        {lane.recovery?.attempt
                          ? `attempt ${lane.recovery.attempt}${lane.recovery.maxAttempts ? `/${lane.recovery.maxAttempts}` : ''} · `
                          : ''}
                        {lane.recovery?.result ? `${lane.recovery.result} · ` : ''}
                        {lane.recovery?.escalated ? 'escalated · ' : ''}
                        {lane.recovery?.steps?.length
                          ? `${lane.recovery.steps.join(' -> ')} · `
                          : ''}
                        {formatIsoAge(lane.updatedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attentionTasks.length === 0 && (
                  <div style={{ fontSize: '17px', color: '#95f3ae' }}>
                    Nenhum card ativo pedindo intervenção.
                  </div>
                )}

                {attentionTasks.slice(0, 6).map((task) => (
                  <div
                    key={task.id}
                    style={{
                      border: `1px solid ${getSeverityColor(task.severity)}`,
                      background: 'rgba(255,255,255,0.03)',
                      padding: '6px 8px',
                    }}
                  >
                    <div style={{ fontSize: '16px', color: '#fff', marginBottom: 2 }}>
                      {task.id} · {task.status}
                      {task.assignee ? ` · ${task.assignee}` : ''}
                    </div>
                    <div style={{ fontSize: '15px', color: '#d7ffe4', marginBottom: 2 }}>
                      {task.title}
                    </div>
                    <div style={{ fontSize: '14px', opacity: 0.82 }}>
                      {describeReason(task)}
                      {task.lastActivityAgeMs !== null
                        ? ` · limite ${formatDurationMs(task.staleThresholdMs)}`
                        : ''}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
