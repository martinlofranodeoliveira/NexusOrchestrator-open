function normalizePrimaryTaskDependencyToken(value) {
  return String(value || '').trim().toUpperCase();
}

function collectPrimaryTaskDependencyKeys(task) {
  const keys = new Set();
  [task?.id, task?.backlogRef, task?.parentTaskRef].forEach((value) => {
    const normalized = normalizePrimaryTaskDependencyToken(value);
    if (normalized) {
      keys.add(normalized);
    }
  });
  return keys;
}

function buildCompletedPrimaryTaskDependencyKeySet(tasks = []) {
  const completedKeys = new Set();
  (Array.isArray(tasks) ? tasks : [])
    .filter((task) => String(task?.status || '').trim() === 'done')
    .forEach((task) => {
      collectPrimaryTaskDependencyKeys(task).forEach((key) => completedKeys.add(key));
    });
  return completedKeys;
}

function normalizeTaskDependencies(task) {
  return Array.isArray(task?.dependencies)
    ? task.dependencies
        .map((value) => normalizePrimaryTaskDependencyToken(value))
        .filter(Boolean)
    : [];
}

function resolveCompletedPrimaryTaskDependencyKeys(completedSource = []) {
  if (completedSource instanceof Set) {
    return completedSource;
  }

  if (Array.isArray(completedSource)) {
    return buildCompletedPrimaryTaskDependencyKeySet(completedSource);
  }

  return buildCompletedPrimaryTaskDependencyKeySet();
}

function arePrimaryTaskDependenciesSatisfied(
  task,
  completedSource = [],
) {
  const completedKeys = resolveCompletedPrimaryTaskDependencyKeys(completedSource);
  const dependencies = normalizeTaskDependencies(task);
  if (dependencies.length === 0) {
    return true;
  }
  return dependencies.every((dependency) => completedKeys.has(dependency));
}

function sortPrimaryTasksBySequence(left, right) {
  const resolveSequence = (task) => {
    const candidates = [task?.id, task?.backlogRef];
    for (const candidate of candidates) {
      const match = /(\d+)/.exec(String(candidate || ''));
      if (match) {
        return Number(match[1]);
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  const leftSequence = resolveSequence(left);
  const rightSequence = resolveSequence(right);
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return String(left?.id || left?.backlogRef || '').localeCompare(
    String(right?.id || right?.backlogRef || ''),
  );
}

function isPrimaryActiveStatus(status) {
  return ['in_progress', 'in_review'].includes(String(status || '').trim());
}

function isPrimaryImplementationFrontStatus(status) {
  return ['ready', 'in_progress'].includes(String(status || '').trim());
}

function countPrimaryImplementationFronts(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) =>
    isPrimaryImplementationFrontStatus(task?.status),
  ).length;
}

function hasAnyActivePrimaryTasks(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).some((task) => isPrimaryActiveStatus(task?.status));
}

function selectNextDependencyReadyBacklogTask(tasks = [], options = {}) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const completedTask = options.completedTask || null;
  const canManageTask =
    typeof options.canManageTask === 'function' ? options.canManageTask : () => true;
  const skipWhenAnyActiveTask = options.skipWhenAnyActiveTask === true;

  const completedTaskKeys = completedTask ? collectPrimaryTaskDependencyKeys(completedTask) : null;
  if (completedTask && completedTaskKeys.size === 0) {
    return null;
  }

  if (skipWhenAnyActiveTask && hasAnyActivePrimaryTasks(taskList)) {
    return null;
  }

  const completedDependencyKeys = buildCompletedPrimaryTaskDependencyKeySet(taskList);

  return (
    taskList
      .filter((task) => String(task?.status || '').trim() === 'backlog')
      .filter((task) => canManageTask(task))
      .filter((task) => !task.assignee)
      .filter((task) => {
        const dependencies = normalizeTaskDependencies(task);
        if (dependencies.length === 0) {
          return completedTaskKeys === null;
        }
        if (completedTaskKeys && !dependencies.some((dependency) => completedTaskKeys.has(dependency))) {
          return false;
        }
        return dependencies.every((dependency) => completedDependencyKeys.has(dependency));
      })
      .sort(sortPrimaryTasksBySequence)[0] || null
  );
}

module.exports = {
  arePrimaryTaskDependenciesSatisfied,
  buildCompletedPrimaryTaskDependencyKeySet,
  countPrimaryImplementationFronts,
  collectPrimaryTaskDependencyKeys,
  hasAnyActivePrimaryTasks,
  isPrimaryImplementationFrontStatus,
  normalizePrimaryTaskDependencyToken,
  resolveCompletedPrimaryTaskDependencyKeys,
  selectNextDependencyReadyBacklogTask,
  sortPrimaryTasksBySequence,
};
