const fs = require('fs');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

function normalizeLoadedHookModule(loaded) {
  if (!loaded) return null;
  if (typeof loaded === 'function') {
    return { default: loaded };
  }
  return loaded;
}

function loadHookModuleViaRequire(resolvedPath) {
  delete require.cache[resolvedPath];
  return require(resolvedPath);
}

function loadHookModuleViaCompile(resolvedPath) {
  const source = fs.readFileSync(resolvedPath, 'utf8');
  const hookModule = new Module(resolvedPath, module);
  hookModule.filename = resolvedPath;
  hookModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath));
  hookModule._compile(source, resolvedPath);
  return hookModule.exports;
}

let hookImportNonce = 0;

async function loadHookModuleViaImport(resolvedPath) {
  const stat = fs.statSync(resolvedPath);
  const versionToken = `${stat.mtimeMs}-${hookImportNonce += 1}`;
  return import(`${pathToFileURL(resolvedPath).href}?nexusHook=${encodeURIComponent(versionToken)}`);
}

function buildLoaderStrategies(resolvedPath) {
  const extension = path.extname(resolvedPath).toLowerCase();
  if (extension === '.mjs') {
    return [
      ['import', loadHookModuleViaImport],
      ['compile', loadHookModuleViaCompile],
    ];
  }

  if (extension === '.cjs') {
    return [
      ['require', loadHookModuleViaRequire],
      ['compile', loadHookModuleViaCompile],
      ['import', loadHookModuleViaImport],
    ];
  }

  return [
    ['require', loadHookModuleViaRequire],
    ['compile', loadHookModuleViaCompile],
    ['import', loadHookModuleViaImport],
  ];
}

async function loadHookModule(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { module: null, error: null };
  }

  const resolvedPath = path.resolve(filePath);
  const attemptErrors = [];

  for (const [mode, loader] of buildLoaderStrategies(resolvedPath)) {
    try {
      const loaded = await loader(resolvedPath);
      return {
        module: normalizeLoadedHookModule(loaded),
        error: null,
        loader: mode,
      };
    } catch (error) {
      attemptErrors.push(`${mode}: ${error?.message || String(error)}`);
    }
  }

  return {
    module: null,
    error: {
      filePath: resolvedPath,
      message: attemptErrors.join(' | '),
    },
  };
}

function defaultProjectHookFiles(projectDir) {
  const root = path.resolve(String(projectDir || process.cwd()));
  return [
    path.join(root, '.nexus', 'hooks.js'),
    path.join(root, '.nexus', 'hooks.cjs'),
    path.join(root, '.nexus', 'hooks.mjs'),
  ].filter((filePath, index, values) => values.indexOf(filePath) === index && fs.existsSync(filePath));
}

async function collectHookSources(params = {}) {
  const sources = [];
  const loadErrors = [];

  for (const filePath of defaultProjectHookFiles(params.projectDir)) {
    const loaded = await loadHookModule(filePath);
    if (loaded.module) {
      sources.push({
        id: `project:${path.basename(filePath)}`,
        filePath,
        module: loaded.module,
      });
    } else if (loaded.error) {
      loadErrors.push({
        sourceId: `project:${path.basename(filePath)}`,
        filePath,
        message: loaded.error.message,
      });
    }
  }

  for (const skill of Array.isArray(params.skills) ? params.skills : []) {
    for (const filePath of Array.isArray(skill?.hookFiles) ? skill.hookFiles : []) {
      const loaded = await loadHookModule(filePath);
      if (loaded.module) {
        sources.push({
          id: `skill:${skill.id}:${path.basename(filePath)}`,
          filePath,
          module: loaded.module,
        });
      } else if (loaded.error) {
        loadErrors.push({
          sourceId: `skill:${skill.id}:${path.basename(filePath)}`,
          filePath,
          message: loaded.error.message,
        });
      }
    }
  }

  return {
    sources: sources.filter((source) => source.module && typeof source.module === 'object'),
    loadErrors,
  };
}

async function runHookPipeline(hookName, payload, context = {}) {
  const { sources, loadErrors } = await collectHookSources(context);
  let nextPayload = payload;
  const notes = [];
  const errors = [...loadErrors];
  let invoked = 0;

  for (const source of sources) {
    const handler =
      typeof source.module[hookName] === 'function'
        ? source.module[hookName]
        : hookName === 'default' && typeof source.module.default === 'function'
          ? source.module.default
          : null;
    if (!handler) continue;

    invoked += 1;
    try {
      const result = await handler({
        ...context,
        hookName,
        payload: nextPayload,
      });

      if (result && typeof result === 'object') {
        if (typeof result.note === 'string' && result.note.trim()) {
          notes.push(result.note.trim());
        }

        if (Object.prototype.hasOwnProperty.call(result, 'payload')) {
          nextPayload = result.payload;
          continue;
        }

        nextPayload = {
          ...(nextPayload && typeof nextPayload === 'object' ? nextPayload : {}),
          ...result,
        };
      }
    } catch (error) {
      errors.push({
        sourceId: source.id,
        filePath: source.filePath,
        message: error?.message || String(error),
      });
    }
  }

  return {
    payload: nextPayload,
    notes,
    errors,
    invoked,
  };
}

module.exports = {
  collectHookSources,
  runHookPipeline,
};
