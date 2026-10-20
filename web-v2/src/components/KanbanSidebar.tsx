import { useMemo, useState } from 'react';

import { getAgentDisplayName, getTaskOwnerLabel, isForeignOwnedTask } from '../agentDisplay.js';
import type { BackendAgent, BoardTask } from '../operationalState.js';
import './KanbanSidebar.css';

interface KanbanSidebarProps {
  tasks: BoardTask[];
  agents: BackendAgent[];
  currentInstanceId?: string | null;
  currentOwnerId?: string | null;
  currentInstanceLabel?: string | null;
  onClose: () => void;
  onMoveTask: (taskId: string, newStatus: string, assigneeId?: string) => void;
  onCreateTask: (payload: {
    title: string;
    status: string;
    assigneeId?: string;
    provider?: 'local' | 'github';
  }) => void;
}

export function KanbanSidebar({
  tasks,
  agents,
  currentInstanceId = null,
  currentOwnerId = null,
  currentInstanceLabel = null,
  onClose,
  onMoveTask,
  onCreateTask,
}: KanbanSidebarProps) {
  const [selectedAssignee, setSelectedAssignee] = useState<Record<string, string>>({});
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('backlog');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskProvider, setNewTaskProvider] = useState<'local' | 'github'>('local');

  const localTasks = useMemo(
    () => tasks.filter((task) => !isForeignOwnedTask(task, currentInstanceId)),
    [tasks, currentInstanceId],
  );
  const foreignTasks = useMemo(
    () => tasks.filter((task) => isForeignOwnedTask(task, currentInstanceId)),
    [tasks, currentInstanceId],
  );

  const handleStatusChange = (taskId: string, newStatus: string) => {
    onMoveTask(taskId, newStatus, selectedAssignee[taskId]);
  };

  const handleCreateTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;

    onCreateTask({
      title,
      status: newTaskStatus,
      assigneeId: newTaskAssignee || undefined,
      provider: newTaskProvider,
    });
    setNewTaskTitle('');
    setNewTaskStatus('backlog');
    setNewTaskAssignee('');
  };

  const renderStatusOptions = () => (
    <>
      <option value="backlog">Backlog</option>
      <option value="ready">Ready</option>
      <option value="in_progress">In Progress</option>
      <option value="in_review">In Review</option>
      <option value="pendente_admin">Pendente ADMIN</option>
      <option value="done">Done</option>
      <option value="blocked">Blocked</option>
    </>
  );

  const renderColumn = (title: string, status: string) => {
    const columnTasks = localTasks.filter((task) => (task.state || task.status) === status);

    return (
      <div className="kanban-column">
        <h3>{title} ({columnTasks.length})</h3>
        <div className="kanban-list">
          {columnTasks.map((task) => {
            const ownerLabel = getTaskOwnerLabel(task);
            const isOwnedLocally = Boolean(ownerLabel && currentOwnerId && ownerLabel === currentOwnerId);
            return (
              <div key={task.id} className="kanban-card">
                <div className="kanban-card-title">{task.id} - {task.title}</div>

                {ownerLabel && (
                  <div className="kanban-card-meta">
                    <span className="kanban-badge">owner: {ownerLabel}</span>
                    {isOwnedLocally && (
                      <span className="kanban-badge kanban-badge-local">esta instancia</span>
                    )}
                  </div>
                )}

                <div className="kanban-card-actions">
                  <select
                    className="kanban-select"
                    value={selectedAssignee[task.id] || task.assignee || ''}
                    onChange={(event) =>
                      setSelectedAssignee({
                        ...selectedAssignee,
                        [task.id]: event.target.value,
                      })
                    }
                  >
                    <option value="">-- Assigner --</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {getAgentDisplayName(agent)}
                      </option>
                    ))}
                  </select>

                  <select
                    className="kanban-select"
                    value={task.state || task.status || 'backlog'}
                    onChange={(event) => handleStatusChange(task.id, event.target.value)}
                  >
                    {renderStatusOptions()}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderForeignColumn = () => (
    <div className="kanban-column kanban-column-foreign">
      <h3>OUTRA INSTANCIA ({foreignTasks.length})</h3>
      <div className="kanban-list">
        {foreignTasks.map((task) => (
          <div key={task.id} className="kanban-card kanban-card-foreign">
            <div className="kanban-card-title">{task.id} - {task.title}</div>
            <div className="kanban-card-meta">
              <span className="kanban-badge kanban-badge-foreign">
                owner: {getTaskOwnerLabel(task) || task.ownerInstanceId || 'externo'}
              </span>
              <span className="kanban-badge">{task.state || task.status || 'backlog'}</span>
            </div>
            <div className="kanban-card-note">
              Este card esta reservado por outra instancia e fica somente em leitura neste painel.
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="kanban-sidebar">
      <div className="kanban-header">
        <div className="kanban-title">Board Operacional (Kanban)</div>
        <button className="kanban-close" onClick={onClose}>[X]</button>
      </div>

      <div className="kanban-instance-banner">
        <span>Instancia atual: {currentInstanceLabel || currentOwnerId || currentInstanceId || 'local'}</span>
        <span>Cards externos: {foreignTasks.length}</span>
      </div>

      <div className="kanban-create-task">
        <div className="kanban-create-title">Nova task</div>
        <input
          className="kanban-input"
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          placeholder="Ex: Criar landing page de teste"
        />
        <div className="kanban-create-grid">
          <select
            className="kanban-select"
            value={newTaskStatus}
            onChange={(event) => setNewTaskStatus(event.target.value)}
          >
            {renderStatusOptions()}
          </select>
          <select
            className="kanban-select"
            value={newTaskAssignee}
            onChange={(event) => setNewTaskAssignee(event.target.value)}
          >
            <option value="">-- Sem assignee --</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {getAgentDisplayName(agent)}
              </option>
            ))}
          </select>
          <select
            className="kanban-select"
            value={newTaskProvider}
            onChange={(event) => setNewTaskProvider(event.target.value as 'local' | 'github')}
          >
            <option value="local">Board local</option>
            <option value="github">Tentar GitHub</option>
          </select>
        </div>
        <button className="kanban-create-button" onClick={handleCreateTask}>
          Criar Task
        </button>
      </div>

      <div className="kanban-board">
        {renderColumn('BACKLOG', 'backlog')}
        {renderColumn('READY', 'ready')}
        {renderColumn('IN PROGRESS', 'in_progress')}
        {renderColumn('IN REVIEW', 'in_review')}
        {renderColumn('PENDENTE ADMIN', 'pendente_admin')}
        {renderColumn('DONE', 'done')}
        {renderColumn('BLOCKED', 'blocked')}
        {foreignTasks.length > 0 && renderForeignColumn()}
      </div>
    </div>
  );
}
