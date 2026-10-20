export interface OperationsAttentionTask {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  ownerId?: string | null;
  ownerInstanceId?: string | null;
  lastActivityAt: string | null;
  lastActivityAgeMs: number | null;
  staleThresholdMs: number;
  stale: boolean;
  severity: 'ok' | 'info' | 'medium' | 'high' | 'critical';
  reason: string;
  execution: {
    running: boolean;
    preparing: boolean;
    queued: boolean;
  };
}

export interface OperationsLaneEvent {
  seq: number;
  event?: string | null;
  status?: string | null;
  state: string;
  detail: string | null;
  emittedAt?: string | null;
  at: string;
  failureClass?: string | null;
  data?: Record<string, unknown> | null;
}

export interface OperationsLaneRecord {
  laneId: string;
  agentId: string;
  agentName: string;
  agentRole: string | null;
  taskId: string | null;
  taskTitle: string | null;
  requestKind: string;
  state: string;
  detail: string | null;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  retryCount: number;
  commandRecoveryCount: number;
  failureClass: string | null;
  failureMessage: string | null;
  recovery?: {
    scenario?: string | null;
    failureClass?: string | null;
    maxAttempts?: number;
    escalationPolicy?: string | null;
    steps?: string[];
    attempt?: number | null;
    result?: string | null;
    escalated?: boolean | null;
  } | null;
  packet?: {
    phase?: string | null;
    collaborationScope?: string | null;
    requestedBy?: {
      id: string;
      name: string;
      role?: string | null;
    } | null;
  } | null;
  events?: OperationsLaneEvent[];
}

export interface OperationsOpencodeValidatorStatus {
  enabled?: boolean;
  available?: boolean;
  ready?: boolean;
  removed?: boolean;
  disabledReason?: string | null;
  command?: string | null;
  version?: string | null;
  defaultModel?: string | null;
  defaultAgent?: string | null;
  defaultVariant?: string | null;
  reviewFormat?: string | null;
  pure?: boolean;
  skipPermissions?: boolean;
  printLogs?: boolean;
  authConfigured?: boolean;
  authFile?: string | null;
  authFileExists?: boolean;
  credentialCount?: number | null;
  globalConfigFile?: string | null;
  projectConfigFile?: string | null;
  modelProviderId?: string | null;
  modelId?: string | null;
  providerEnvHints?: Array<{
    expression: string;
    scope: 'auth' | 'metadata';
    optional: boolean;
    ok: boolean;
  }>;
}

export interface OperationsOpencodeReviewGateStatus {
  enabled?: boolean;
  mode?: 'advisory' | 'required' | string;
  timeoutMs?: number;
  removed?: boolean;
  disabledReason?: string | null;
}

export interface OperationsRoomSummary {
  id: string;
  name: string;
  team: string;
  floor: number;
  topology?: string | null;
  archetypeId?: string | null;
  specializationRole?: string | null;
  defaultTask?: string | null;
  description?: string | null;
  configuredSlots?: number;
  replicaTarget?: number;
  occupants?: number;
  availableSlots?: number;
  interlinkedRoomIds?: string[];
  roles?: Record<string, number>;
}

export interface OperationsSnapshot {
  instanceId?: string | null;
  ownerId?: string | null;
  agents?: {
    total?: number;
    byStatus?: Record<string, number>;
  };
  tasks?: {
    total?: number;
    byStatus?: Record<string, number>;
  };
  collaboration?: {
    total?: number;
    byStatus?: Record<string, number>;
  };
  rooms?: {
    totalConfigured?: number;
    byTeam?: Record<string, number>;
    byTopology?: Record<string, number>;
    bySpecializationRole?: Record<string, number>;
    items?: OperationsRoomSummary[];
  };
  runs?: {
    active?: number;
    preparing?: number;
    queued?: number;
  };
  lanes?: {
    totalTracked?: number;
    active?: number;
    byState?: Record<string, number>;
    agents?: OperationsLaneRecord[];
    recentFailures?: OperationsLaneRecord[];
  };
  settings?: {
    boardProvider?: string;
    githubConfigured?: boolean;
    projectSyncEnabled?: boolean;
    bootstrapDemoTasksEnabled?: boolean;
    autoDispatchEnabled?: boolean;
    orphanTaskRescueEnabled?: boolean;
    activeTaskStaleMs?: number;
    reviewTaskStaleMs?: number;
    staleTaskMonitorIntervalMs?: number;
    staleTaskAlertCooldownMs?: number;
    primaryTaskFailurePenaltyWindowMs?: number;
    roomTemplatesConfigured?: number;
    builtinRoomTopology?: string | null;
    roomTemplateSource?: string | null;
    ralphExtensionConfigured?: boolean;
    ralphExtensionInstalled?: boolean;
    ralphExtensionActive?: boolean;
    ralphExtensionFailureLimit?: number;
    ralphExtensionFailureCount?: number;
    ralphExtensionDisabled?: boolean;
    ralphExtensionDisabledReason?: string | null;
    opencodeValidator?: OperationsOpencodeValidatorStatus | null;
    opencodeReviewGate?: OperationsOpencodeReviewGateStatus | null;
  };
  attention?: {
    healthy?: boolean;
    totalActivePrimaryTasks?: number;
    flaggedCount?: number;
    criticalCount?: number;
    activeWithoutAssigneeCount?: number;
    waitingWithoutExecutionCount?: number;
    queuedCount?: number;
    tasks?: OperationsAttentionTask[];
    criticalTasks?: OperationsAttentionTask[];
  };
}
