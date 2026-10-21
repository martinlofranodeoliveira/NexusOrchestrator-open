import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BottomToolbar } from './components/BottomToolbar.js';
import { DebugView } from './components/DebugView.js';
import { FleetStatusBar } from './components/FleetStatusBar.js';
import './components/FleetStatusBar.css';
import { KanbanSidebar } from './components/KanbanSidebar.js';
import { LiveLogDock } from './components/LiveLogDock.js';
import { MeetingModal } from './components/MeetingModal.js';
import { OperationsDock, type OperationsSnapshot } from './components/OperationsDock.js';
import { RHModal } from './components/RHModal.js';
import type { AgentConfig } from './components/RHModal.js';
import { ZoomControls } from './components/ZoomControls.js';
import { RetroTerminal } from './components/RetroTerminal.tsx';
import { findAgentByNumericId, getNumericAgentId } from './agentIds.js';
import { BACKEND_ORIGIN, apiUrl } from './backend.js';
import { PULSE_ANIMATION_DURATION_SEC } from './constants.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { getAgentDisplayName, resolveInstanceLabel } from './agentDisplay.js';
import {
  buildOperationalAgentStates,
  type BackendAgent,
  type BoardTask,
} from './operationalState.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { OfficeState } from './office/engine/officeState.js';
import { isRotatable } from './office/layout/furnitureCatalog.js';
import { EditTool } from './office/types.js';
import { isBrowserRuntime } from './runtime.js';
import { vscode } from './vscodeApi.js';
import { io } from 'socket.io-client';

const socket = io(BACKEND_ORIGIN);

interface LiveLogEntry {
  seq: number;
  agentId: number;
  backendId: string;
  text: string;
}

interface AgentModalState {
  mode: 'create' | 'edit';
  agentId?: string;
  initialConfig?: Partial<AgentConfig>;
}

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

const actionBarBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: 'var(--pixel-btn-disabled-opacity)',
  cursor: 'default',
};

function EditActionBar({
  editor,
  editorState: es,
}: {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const undoDisabled = es.undoStack.length === 0;
  const redoDisabled = es.redoStack.length === 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button style={actionBarBtnStyle} onClick={editor.handleSave} title="Save layout">
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '22px', color: 'var(--pixel-reset-text)' }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
            onClick={() => {
              setShowResetConfirm(false);
              editor.handleReset();
            }}
          >
            Yes
          </button>
          <button style={actionBarBtnStyle} onClick={() => setShowResetConfirm(false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const [serverLogs, setServerLogs] = useState<Record<number, string[]>>({});
  const [liveLogEntries, setLiveLogEntries] = useState<LiveLogEntry[]>([]);
  const [terminalAgent, setTerminalAgent] = useState<number | null>(null);
  const [agentModalState, setAgentModalState] = useState<AgentModalState | null>(null);
  const [isKanbanOpen, setIsKanbanOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [storedGithubTasks, setGithubTasks] = useState<BoardTask[]>([]);
  const [storedBackendAgents, setBackendAgents] = useState<BackendAgent[]>([]);
  const [storedOperationsSnapshot, setOperationsSnapshot] = useState<OperationsSnapshot | null>(null);
  const [transportConnected, setTransportConnected] = useState(socket.connected);
  const [observerNow, setObserverNow] = useState(Date.now);
  const fleetEnabled = Boolean(storedOperationsSnapshot?.settings?.externalFleet?.enabled);
  const operationsSnapshot = useMemo(() => {
    const fleet = storedOperationsSnapshot?.settings?.externalFleet;
    if (!fleet?.enabled) return storedOperationsSnapshot;
    const expired = fleet.updatedAtMs === null || observerNow - fleet.updatedAtMs > 30000;
    if (transportConnected && !expired) return storedOperationsSnapshot;
    return {
      ...storedOperationsSnapshot,
      runs: { ...storedOperationsSnapshot?.runs, active: 0, preparing: 0, queued: 0 },
      settings: { ...storedOperationsSnapshot?.settings, externalFleet: {
        ...fleet, state: !transportConnected || fleet.state === 'unavailable'
          ? 'unavailable' as const : 'stale' as const,
      } },
    };
  }, [storedOperationsSnapshot, transportConnected, observerNow]);
  const unconfirmedFleet = fleetEnabled && operationsSnapshot?.settings?.externalFleet?.state !== 'live';
  const backendAgents = useMemo(() => unconfirmedFleet ? storedBackendAgents.map((agent) => ({
    ...agent, state: 'unavailable', status: 'unavailable', task: '', currentTask: '',
    currentTaskId: null, activeTaskId: null, laneState: null, laneTaskId: null,
  })) : storedBackendAgents, [storedBackendAgents, unconfirmedFleet]);
  const githubTasks = useMemo(() => unconfirmedFleet ? storedGithubTasks.map((task) => ({
    ...task, assignee: null, state: (task.state || task.status) === 'done' ? 'done' : 'blocked',
  })) : storedGithubTasks, [storedGithubTasks, unconfirmedFleet]);
  useEffect(() => {
    if (!fleetEnabled) return;
    const timer = window.setInterval(() => setObserverNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, [fleetEnabled]);
  const liveLogSeqRef = useRef(1);
  const operationalAgentStates = useMemo(
    () => buildOperationalAgentStates(backendAgents, githubTasks, operationsSnapshot),
    [backendAgents, githubTasks, operationsSnapshot],
  );
  const displayAgents = useMemo(
    () =>
      backendAgents.map((agent) => ({
        ...agent,
        ownerId: agent.ownerId || operationsSnapshot?.ownerId || null,
        instanceId: agent.instanceId || operationsSnapshot?.instanceId || null,
        displayName: getAgentDisplayName(agent, operationsSnapshot),
      })),
    [backendAgents, operationsSnapshot],
  );
  const currentInstanceLabel = useMemo(
    () => resolveInstanceLabel(operationsSnapshot),
    [operationsSnapshot],
  );
  const roomOptions = useMemo(
    () => operationsSnapshot?.rooms?.items || [],
    [operationsSnapshot],
  );

  const loadOperationalSnapshot = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/health'));
      if (!response.ok) return;
      const payload = await response.json();
      setOperationsSnapshot(payload?.status || null);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const defaultAgentTemplate = useMemo<Partial<AgentConfig>>(() => {
    const defaultPrimaryRoom =
      roomOptions.find((room) => room.team !== 'review' && room.specializationRole === 'dev')
      || roomOptions.find((room) => room.team !== 'review' && room.archetypeId !== 'ceo')
      || roomOptions.find((room) => room.team !== 'review')
      || roomOptions[0]
      || null;
    const seedAgent =
      backendAgents.find((agent) => agent.id === 'dev') ||
      backendAgents.find((agent) => agent.role !== 'ceo' && agent.team !== 'review') ||
      backendAgents[0];

    return {
      role: 'dev',
      llmProvider: seedAgent?.llmProvider || 'gemini',
      model: seedAgent?.model || 'gemini-3.1-flash-lite-preview',
      reasoningEffort: seedAgent?.reasoningEffort || '',
      fallbackModels: Array.isArray(seedAgent?.fallbackModels) ? seedAgent.fallbackModels : [],
      skills: Array.isArray(seedAgent?.skills) ? seedAgent.skills : [],
      prompt: seedAgent?.prompt || '',
      mcps: [],
      team: defaultPrimaryRoom?.team || 'primary',
      floor: defaultPrimaryRoom?.floor || 1,
      roomId: defaultPrimaryRoom?.id || '',
    };
  }, [backendAgents, roomOptions]);

  const openCreateAgentModal = useCallback(() => {
    setAgentModalState({
      mode: 'create',
      initialConfig: defaultAgentTemplate,
    });
  }, [defaultAgentTemplate]);

  const handleEditAgent = useCallback((agentId: string) => {
    const agent = backendAgents.find((candidate) => candidate.id === agentId);
    if (!agent) return;

    setAgentModalState({
      mode: 'edit',
      agentId,
      initialConfig: {
        name: agent.name,
        role: agent.role || 'dev',
        llmProvider: agent.llmProvider || 'gemini',
        model: agent.model || 'gemini-3.1-flash-lite-preview',
        reasoningEffort: agent.reasoningEffort || '',
        fallbackModels: Array.isArray(agent.fallbackModels) ? agent.fallbackModels : [],
        skills: Array.isArray(agent.skills) ? agent.skills : [],
        prompt: agent.prompt || '',
        mcps: Array.isArray(agent.mcps) ? agent.mcps : [],
        team: agent.team || 'primary',
        floor: agent.floor || 1,
        roomId: agent.roomId || '',
      },
    });
  }, [backendAgents]);

  const handleSubmitAgent = useCallback(async (config: AgentConfig) => {
    const isEditing = agentModalState?.mode === 'edit' && agentModalState.agentId;
    const endpoint = isEditing ? `/api/agents/${agentModalState.agentId}` : '/api/add_agent';
    const method = isEditing ? 'PATCH' : 'POST';

    try {
      const response = await fetch(apiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setAgentModalState(null);
    } catch (error: any) {
      console.error(error);
      alert(`Falha ao salvar o agente: ${error.message}`);
    }
  }, [agentModalState]);

  // Socket listeners should be registered as early as possible
  useEffect(() => {
    (window as any).socket = socket;
    console.log('🔌 Socket.io Status:', socket.connected ? 'Already Connected' : 'Connecting...');
    
    const onConnect = () => {
      // A fresh operations event confirms recovery; reconnect alone must not
      // restore activity from a cached snapshot.
      setTransportConnected(false);
      console.log('✅ Connected to backend socket');
      socket.emit('request_initial_state');
      void loadOperationalSnapshot();
    };

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    const onDisconnect = () => setTransportConnected(false);
    socket.on('disconnect', onDisconnect);

    socket.on('agents_update', (data: BackendAgent[]) => {
      console.log('🤖 Agents update received:', data.length);
      setBackendAgents(data);
    });

    socket.on('tasks_update', (tasks: BoardTask[]) => {
      console.log('📋 Tasks update received:', tasks.length);
      setGithubTasks(tasks);
    });

    socket.on('operations_update', (snapshot: OperationsSnapshot) => {
      setTransportConnected(socket.connected);
      setObserverNow(Date.now());
      setOperationsSnapshot(snapshot);
    });

    socket.on('agent_log', (data) => {
      const backendId = String(data.id || 'ceo');
      const numId = getNumericAgentId(backendId);
      setServerLogs(prev => {
        return {
          ...prev,
          [numId]: [...(prev[numId] || []), data.log].slice(-500)
        };
      });
      setLiveLogEntries((prev) => [
        ...prev,
        {
          seq: liveLogSeqRef.current++,
          agentId: numId,
          backendId,
          text: String(data.log || ''),
        },
      ].slice(-250));
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('agents_update');
      socket.off('tasks_update');
      socket.off('operations_update');
      socket.off('agent_log');
    };
  }, [loadOperationalSnapshot]);

  useEffect(() => {
    void loadOperationalSnapshot();
  }, [loadOperationalSnapshot]);

  // Browser runtime initialization
  useEffect(() => {
    if (isBrowserRuntime) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => {
        dispatchMockMessages();
      });
    }
    
    const vscodeListener = (e: any) => {
      const msg = e.detail;
      if (msg.type === 'openClaude') {
        openCreateAgentModal();
      }
    };
    window.addEventListener('vscode-msg', vscodeListener);
    
    return () => {
      window.removeEventListener('vscode-msg', vscodeListener);
    };
  }, [openCreateAgentModal]);

  const handleStartMeeting = (topic: string, agentIds: string[]) => {
    setTerminalAgent(1); // CEO Terminal
    fetch(apiUrl('/api/start_meeting'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, agentIds })
    }).catch(console.error);
    setIsMeetingModalOpen(false);
  };

  // Effect to sync our internal 'backendAgents' state with pixel-agents engine
  useEffect(() => {
    const os = getOfficeState();
    const activeNumericIds = new Set<number>();

    displayAgents.forEach((agent, index) => {
      const numId = getNumericAgentId(String(agent.id || ''), index);
      activeNumericIds.add(numId);
      os.setAgentAffinity(numId, {
        team: agent.team || null,
        floor: Number.isFinite(agent.floor) ? Number(agent.floor) : null,
        roomId: agent.roomId || null,
      });
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'agentCreated', id: numId, folderName: agent.displayName || agent.name }
      }));

      const operationalState = operationalAgentStates[numId];
      // Support both legacy (`status`/`task`) and newer (`state`/`currentTask`) payloads.
      const agentState = agent.state || agent.status || 'idle';
      const agentTask = agent.currentTask || agent.task || '';
      const normalizedTask = String(agentTask).toLowerCase();
      const hasTask = Boolean(
        agentTask || agent.currentTaskId || agent.activeTaskId || operationalState?.taskId,
      );
      const isPreparingOrResuming =
        normalizedTask.startsWith('preparando') ||
        normalizedTask.startsWith('retomando') ||
        normalizedTask.startsWith('continuando');
      const statusMap: Record<string, string> = {
        idle: 'idle',
        running: 'active',      // Agent working on task
        coding: 'active',
        helping: 'active',
        testing: 'active',
        meeting: 'meeting',     // Agent in meeting (sitting at table)
        preparing: 'active',
        paused: 'waiting',
        waiting: 'waiting',
        completed: 'idle',
        failed: 'waiting',
        thinking: hasTask || isPreparingOrResuming ? 'active' : 'idle',
        blocked: 'waiting',
        error: 'waiting',
        unavailable: 'waiting',
      };
      const fallbackVisualStatus = statusMap[String(agentState)] || (hasTask ? 'active' : 'idle');
      const visualStatus =
        operationalState?.kind === 'meeting'
          ? 'meeting'
          : ['working', 'reviewing', 'recovering', 'suspicious'].includes(
                operationalState?.kind || '',
              )
            ? 'active'
            : operationalState?.kind === 'waiting'
              ? 'waiting'
              : fallbackVisualStatus;

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'agentStatus', id: numId, status: visualStatus }
      }));

      // Show tool activity when agent is working
      if (visualStatus === 'active' && hasTask) {
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            type: 'agentToolStart',
            id: numId,
            toolId: 'task',
            status: operationalState?.description || agentTask || 'Working...',
          }
        }));
      } else if (visualStatus !== 'meeting') {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'agentToolsClear', id: numId }
        }));
      }
    });
    os.pruneAgentAffinities(activeNumericIds);
  }, [displayAgents, operationalAgentStates]);

  const handleMoveTask = async (taskId: string, newStatus: string, assigneeId?: string) => {
    try {
      await fetch(apiUrl('/api/tasks/move'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, newStatus, assigneeId })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateTask = async (payload: {
    title: string;
    status: string;
    assigneeId?: string;
    provider?: 'local' | 'github';
  }) => {
    try {
      await fetch(apiUrl('/api/tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents: engineAgents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  // Show migration notice once layout reset is detected
  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isDebugMode, setIsDebugMode] = useState(false);
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleAlwaysShowOverlay = useCallback(
    () => setAlwaysShowOverlay((prev) => !prev),
    [],
  );

  const handleSelectAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'focusAgent', id });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  );

  const handleCloseAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'closeAgent', id });
  }, []);

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;
    setTerminalAgent(focusId);
    // vscode.postMessage({ type: 'focusAgent', id: focusId });
  }, []);

  const officeState = getOfficeState();
  const activeTerminalAgent =
    terminalAgent !== null
      ? findAgentByNumericId(displayAgents, terminalAgent) || {
          id: `agent_${terminalAgent}`,
          name: `Agent ${terminalAgent}`,
        }
      : null;

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard;

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();

  if (!layoutReady) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--vscode-foreground)',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
        .pixel-agents-migration-btn:hover { filter: brightness(0.8); }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
      />

      {!isDebugMode && <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />}

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--pixel-vignette)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      <BottomToolbar
        isEditMode={editor.isEditMode}
        onOpenClaude={editor.handleOpenClaude}
        onToggleEditMode={editor.handleToggleEditMode}
        isDebugMode={isDebugMode}
        onToggleDebugMode={handleToggleDebugMode}
        alwaysShowOverlay={alwaysShowOverlay}
        onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
        workspaceFolders={workspaceFolders}
        onOpenKanban={() => setIsKanbanOpen(true)}
        onStartMeeting={operationsSnapshot?.settings?.externalFleet?.enabled ? undefined : () => setIsMeetingModalOpen(true)}
        canManageAgents={!operationsSnapshot?.settings?.externalFleet?.enabled}
      />

      {operationsSnapshot?.settings?.externalFleet?.enabled && (
        <FleetStatusBar
          snapshot={operationsSnapshot}
          onOpenBoard={() => setIsKanbanOpen(true)}
          onRefresh={() => { void loadOperationalSnapshot(); }}
        />
      )}

      {editor.isEditMode && editor.isDirty && (
        <EditActionBar editor={editor} editorState={editorState} />
      )}

      {isKanbanOpen && (
        <KanbanSidebar 
          tasks={githubTasks} 
          agents={displayAgents}
          currentInstanceId={operationsSnapshot?.instanceId || null}
          currentOwnerId={operationsSnapshot?.ownerId || null}
          currentInstanceLabel={currentInstanceLabel}
          onClose={() => setIsKanbanOpen(false)} 
          onMoveTask={handleMoveTask} 
          onCreateTask={handleCreateTask}
          readOnly={operationsSnapshot?.settings?.externalFleet?.enabled}
        />
      )}

      {showRotateHint && (
        <div
          style={{
            position: 'absolute',
            top: editor.isDirty ? 52 : 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 49,
            background: 'var(--pixel-hint-bg)',
            color: '#fff',
            fontSize: '20px',
            padding: '3px 8px',
            borderRadius: 0,
            border: '2px solid var(--pixel-accent)',
            boxShadow: 'var(--pixel-shadow)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Rotate (R)
        </div>
      )}

      {editor.isEditMode &&
        (() => {
          // Compute selected furniture color from current layout
          const selUid = editorState.selectedFurnitureUid;
          const selColor = selUid
            ? (officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null)
            : null;
          return (
            <EditorToolbar
              activeTool={editorState.activeTool}
              selectedTileType={editorState.selectedTileType}
              selectedFurnitureType={editorState.selectedFurnitureType}
              selectedFurnitureUid={selUid}
              selectedFurnitureColor={selColor}
              floorColor={editorState.floorColor}
              wallColor={editorState.wallColor}
              selectedWallSet={editorState.selectedWallSet}
              onToolChange={editor.handleToolChange}
              onTileTypeChange={editor.handleTileTypeChange}
              onFloorColorChange={editor.handleFloorColorChange}
              onWallColorChange={editor.handleWallColorChange}
              onWallSetChange={editor.handleWallSetChange}
              onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
              onFurnitureTypeChange={editor.handleFurnitureTypeChange}
              loadedAssets={loadedAssets}
            />
          );
        })()}

      {!isDebugMode && (
        <ToolOverlay
          officeState={officeState}
          agents={engineAgents}
          agentTools={agentTools}
          subagentCharacters={subagentCharacters}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
          onCloseAgent={handleCloseAgent}
          onEditAgent={handleEditAgent}
          canManageAgents={!operationsSnapshot?.settings?.externalFleet?.enabled}
          alwaysShowOverlay={alwaysShowOverlay}
          tasks={operationsSnapshot?.settings?.externalFleet?.enabled
            ? githubTasks.filter((task) => ['ready', 'in_progress'].includes(task.state || task.status || ''))
            : githubTasks}
          backendAgents={displayAgents}
          operationalStates={operationalAgentStates}
        />
      )}

      {isDebugMode && (
        <DebugView
          agents={engineAgents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          operationalStates={operationalAgentStates}
          subagentTools={subagentTools}
          onSelectAgent={handleSelectAgent}
        />
      )}

      {showMigrationNotice && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setMigrationNoticeDismissed(true)}
        >
          <div
            style={{
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              padding: '24px 32px',
              maxWidth: 620,
              boxShadow: 'var(--pixel-shadow)',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '40px', marginBottom: 12, color: 'var(--pixel-accent)' }}>
              We owe you an apology!
            </div>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              We've just migrated to fully open-source assets, all built from scratch with love.
              Unfortunately, this means your previous layout had to be reset.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              We're really sorry about that.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              The good news? This was a one-time thing, and it paves the way for some genuinely
              exciting updates ahead.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text-dim)', margin: '0 0 20px 0' }}>
              Stay tuned, and thanks for using Pixel Agents!
            </p>
            <button
              className="pixel-agents-migration-btn"
              style={{
                padding: '6px 24px 8px',
                fontSize: '30px',
                background: 'var(--pixel-accent)',
                color: '#fff',
                border: '2px solid var(--pixel-accent)',
                borderRadius: 0,
                cursor: 'pointer',
                boxShadow: 'var(--pixel-shadow)',
              }}
              onClick={() => setMigrationNoticeDismissed(true)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {agentModalState && (
        <RHModal
          mode={agentModalState.mode}
          initialConfig={agentModalState.initialConfig}
          roomOptions={roomOptions}
          onClose={() => setAgentModalState(null)}
          onSubmit={handleSubmitAgent}
        />
      )}

      {isMeetingModalOpen && (
        <MeetingModal
          agents={displayAgents}
          currentInstanceLabel={currentInstanceLabel}
          onClose={() => setIsMeetingModalOpen(false)}
          onStart={handleStartMeeting}
        />
      )}

      <LiveLogDock
        entries={liveLogEntries}
        agents={displayAgents}
        operationalStates={operationalAgentStates}
        onOpenAgent={(agentId) => setTerminalAgent(agentId)}
        bottomOffset={operationsSnapshot?.settings?.externalFleet?.enabled ? 76 : 10}
      />

      {!operationsSnapshot?.settings?.externalFleet?.enabled && (
        <OperationsDock snapshot={operationsSnapshot} onOpenKanban={() => setIsKanbanOpen(true)} />
      )}

      {terminalAgent && (
        <RetroTerminal 
          agent={activeTerminalAgent}
          currentInstanceLabel={currentInstanceLabel}
          logs={serverLogs[terminalAgent] || []}
          readOnly={operationsSnapshot?.settings?.externalFleet?.enabled}
          onClose={() => setTerminalAgent(null)}
          onStartTask={(id: string, taskInput: string) => {
            fetch(apiUrl('/api/start_ralph'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, task: taskInput })
            }).catch(e => console.error(e));
          }}
        />
      )}
    </div>
  );
}

export default App;
