const DEFAULT_FIGMA_API_BASE_URL = 'https://api.figma.com/v1';
const DEFAULT_FIGMA_NODE_CONTEXT_DEPTH = 4;
const DEFAULT_FIGMA_MAX_CHILDREN_PER_NODE = 12;
const DEFAULT_FIGMA_MAX_TOTAL_NODES = 160;
const DEFAULT_FIGMA_REQUEST_TIMEOUT_MS = 30000;
const MAX_TEXT_PREVIEW_CHARS = 280;
const MAX_COMPONENT_REFERENCES = 16;
const MAX_GRADIENT_STOPS = 4;

function trimString(value) {
  return String(value || '').trim();
}

function roundNumber(value, precision = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** precision;
  return Math.round(parsed * factor) / factor;
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, parsed));
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, parsed));
}

function detectFigmaTokenSource(env = process.env) {
  if (trimString(env.FIGMA_ACCESS_TOKEN)) {
    return 'FIGMA_ACCESS_TOKEN';
  }
  if (trimString(env.NEXUS_FIGMA_ACCESS_TOKEN)) {
    return 'NEXUS_FIGMA_ACCESS_TOKEN';
  }
  return null;
}

function readFigmaAccessToken(env = process.env) {
  const tokenSource = detectFigmaTokenSource(env);
  if (!tokenSource) {
    return null;
  }
  return trimString(env[tokenSource]);
}

function normalizeFigmaApiBaseUrl(rawValue = process.env.NEXUS_FIGMA_API_BASE_URL) {
  const baseUrl = trimString(rawValue) || DEFAULT_FIGMA_API_BASE_URL;
  return baseUrl.replace(/\/+$/, '');
}

function getFigmaBridgeStatus(options = {}) {
  const env = options.env || process.env;
  const tokenSource = detectFigmaTokenSource(env);
  const tokenConfigured = Boolean(tokenSource);

  return {
    enabled: true,
    ready: tokenConfigured,
    tokenConfigured,
    tokenSource,
    apiBaseUrl: normalizeFigmaApiBaseUrl(env.NEXUS_FIGMA_API_BASE_URL),
    defaults: {
      maxDepth: DEFAULT_FIGMA_NODE_CONTEXT_DEPTH,
      maxChildrenPerNode: DEFAULT_FIGMA_MAX_CHILDREN_PER_NODE,
      maxTotalNodes: DEFAULT_FIGMA_MAX_TOTAL_NODES,
      requestTimeoutMs: DEFAULT_FIGMA_REQUEST_TIMEOUT_MS,
    },
  };
}

function normalizeFigmaNodeId(value) {
  const rawValue = trimString(value);
  if (!rawValue) return null;

  const normalizedValue = rawValue.replace(/-/g, ':');
  if (!/^\d+:\d+$/.test(normalizedValue)) {
    throw new Error(`nodeId Figma inválido: ${rawValue}. Use o formato 123:456 ou 123-456.`);
  }

  return normalizedValue;
}

function normalizeFigmaNodeIds(value) {
  const values = [];

  const appendValue = (candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(appendValue);
      return;
    }

    const rawValue = trimString(candidate);
    if (!rawValue) return;

    rawValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        values.push(normalizeFigmaNodeId(entry));
      });
  };

  appendValue(value);
  return [...new Set(values)];
}

function parseFigmaUrl(rawUrl) {
  const urlText = trimString(rawUrl);
  if (!urlText) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(urlText);
  } catch (error) {
    throw new Error(`URL Figma inválida: ${urlText}.`);
  }

  if (!/(^|\.)figma\.com$/i.test(parsedUrl.hostname)) {
    throw new Error(`Host Figma inválido: ${parsedUrl.hostname}.`);
  }

  const segments = parsedUrl.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    throw new Error(`Não foi possível extrair o fileKey da URL Figma: ${urlText}.`);
  }

  let fileKey = null;
  if (['design', 'file', 'board', 'make'].includes(segments[0])) {
    fileKey = segments[1] || null;
    if ((segments[0] === 'design' || segments[0] === 'file') && segments[2] === 'branch' && segments[3]) {
      fileKey = segments[3];
    }
  }

  if (!fileKey) {
    throw new Error(`URL Figma sem fileKey reconhecível: ${urlText}.`);
  }

  const nodeIds = normalizeFigmaNodeIds([
    ...parsedUrl.searchParams.getAll('node-id'),
    ...parsedUrl.searchParams.getAll('node_id'),
  ]);

  return {
    url: parsedUrl.toString(),
    fileKey,
    nodeIds,
    nodeId: nodeIds[0] || null,
  };
}

function resolveFigmaTarget(input = {}) {
  const parsedUrl = trimString(input.url) ? parseFigmaUrl(input.url) : null;
  const nodeIds = normalizeFigmaNodeIds([
    parsedUrl?.nodeIds || [],
    input.nodeId,
    input.nodeIds,
  ]);
  const fileKey = trimString(input.fileKey) || parsedUrl?.fileKey || null;

  if (!fileKey) {
    throw new Error('Informe `url` ou `fileKey` para acessar o Figma.');
  }

  return {
    url: parsedUrl?.url || null,
    fileKey,
    nodeIds,
    nodeId: nodeIds[0] || null,
  };
}

function createFigmaApiUrl(endpointPath, params = {}, env = process.env) {
  const normalizedPath = String(endpointPath || '').replace(/^\/+/, '');
  const url = new URL(`${normalizeFigmaApiBaseUrl(env.NEXUS_FIGMA_API_BASE_URL)}/${normalizedPath}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || typeof value === 'undefined' || value === '') {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

async function requestFigmaJson(endpointPath, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  const timeoutMs = clampInteger(
    options.timeoutMs,
    1000,
    120000,
    DEFAULT_FIGMA_REQUEST_TIMEOUT_MS,
  );
  const token = readFigmaAccessToken(env);

  if (!token) {
    throw new Error(
      'FIGMA_ACCESS_TOKEN ausente. Configure o token antes de habilitar o MCP `figma` para uma lane.',
    );
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch indisponível no runtime Node atual para acessar a API do Figma.');
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutHandle = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(createFigmaApiUrl(endpointPath, options.params, env), {
      method: 'GET',
      headers: {
        'X-Figma-Token': token,
        'User-Agent': 'NexusOrchestrator/figma-bridge',
      },
      signal: controller?.signal,
    });

    if (!response.ok) {
      const errorText = trimString(await response.text());
      throw new Error(
        `Figma API ${response.status}: ${errorText || response.statusText || 'falha desconhecida'}`,
      );
    }

    return response.json();
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function compactValue(value) {
  if (Array.isArray(value)) {
    const nextArray = value
      .map(compactValue)
      .filter((entry) => {
        if (entry === null || typeof entry === 'undefined') return false;
        if (Array.isArray(entry)) return entry.length > 0;
        if (typeof entry === 'object') return Object.keys(entry).length > 0;
        return true;
      });
    return nextArray.length > 0 ? nextArray : undefined;
  }

  if (value && typeof value === 'object') {
    const nextObject = Object.entries(value).reduce((accumulator, [key, entryValue]) => {
      const compactedValue = compactValue(entryValue);
      if (
        compactedValue === null
        || typeof compactedValue === 'undefined'
        || (typeof compactedValue === 'string' && !compactedValue.trim())
      ) {
        return accumulator;
      }
      if (Array.isArray(compactedValue) && compactedValue.length === 0) {
        return accumulator;
      }
      if (
        compactedValue
        && typeof compactedValue === 'object'
        && !Array.isArray(compactedValue)
        && Object.keys(compactedValue).length === 0
      ) {
        return accumulator;
      }
      accumulator[key] = compactedValue;
      return accumulator;
    }, {});
    return Object.keys(nextObject).length > 0 ? nextObject : undefined;
  }

  return value;
}

function normalizeColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value || 0) * 255)));
}

function colorToHex(color) {
  if (!color || typeof color !== 'object') return null;
  const red = normalizeColorChannel(color.r).toString(16).padStart(2, '0');
  const green = normalizeColorChannel(color.g).toString(16).padStart(2, '0');
  const blue = normalizeColorChannel(color.b).toString(16).padStart(2, '0');
  return `#${red}${green}${blue}`.toUpperCase();
}

function summarizeColor(color, opacity = null) {
  if (!color || typeof color !== 'object') return null;
  return compactValue({
    hex: colorToHex(color),
    opacity: opacity === null ? roundNumber(color.a, 3) : roundNumber(opacity, 3),
  });
}

function summarizeGradientStops(stops = []) {
  return stops
    .slice(0, MAX_GRADIENT_STOPS)
    .map((stop) =>
      compactValue({
        position: roundNumber(stop.position, 3),
        color: summarizeColor(stop.color),
      }),
    )
    .filter(Boolean);
}

function summarizePaint(paint) {
  if (!paint || typeof paint !== 'object' || paint.visible === false) {
    return null;
  }

  switch (paint.type) {
    case 'SOLID':
      return compactValue({
        type: paint.type,
        color: summarizeColor(paint.color, paint.opacity),
        blendMode: paint.blendMode || null,
      });
    case 'IMAGE':
      return compactValue({
        type: paint.type,
        opacity: roundNumber(paint.opacity, 3),
        scaleMode: paint.scaleMode || null,
        imageRef: paint.imageRef || null,
        imageTransform: Array.isArray(paint.imageTransform)
          ? paint.imageTransform.map((row) => row.map((entry) => roundNumber(entry, 3)))
          : null,
      });
    case 'GRADIENT_LINEAR':
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_ANGULAR':
    case 'GRADIENT_DIAMOND':
      return compactValue({
        type: paint.type,
        opacity: roundNumber(paint.opacity, 3),
        gradientStops: summarizeGradientStops(paint.gradientStops),
      });
    default:
      return compactValue({
        type: paint.type,
        opacity: roundNumber(paint.opacity, 3),
      });
  }
}

function summarizePaintList(paints) {
  if (!Array.isArray(paints) || paints.length === 0) return undefined;

  const summarized = paints
    .map(summarizePaint)
    .filter(Boolean)
    .slice(0, 4);

  return summarized.length > 0 ? summarized : undefined;
}

function summarizeEffects(effects) {
  if (!Array.isArray(effects) || effects.length === 0) return undefined;

  const summarized = effects
    .filter((effect) => effect && effect.visible !== false)
    .slice(0, 4)
    .map((effect) =>
      compactValue({
        type: effect.type || null,
        radius: roundNumber(effect.radius, 2),
        spread: roundNumber(effect.spread, 2),
        offset: effect.offset
          ? {
              x: roundNumber(effect.offset.x, 2),
              y: roundNumber(effect.offset.y, 2),
            }
          : null,
        color: summarizeColor(effect.color),
      }),
    )
    .filter(Boolean);

  return summarized.length > 0 ? summarized : undefined;
}

function summarizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  return compactValue({
    x: roundNumber(bounds.x, 2),
    y: roundNumber(bounds.y, 2),
    width: roundNumber(bounds.width, 2),
    height: roundNumber(bounds.height, 2),
  });
}

function summarizeTextStyle(node) {
  const style = node?.style;
  if (!style || typeof style !== 'object') return undefined;

  return compactValue({
    fontFamily: style.fontFamily || null,
    fontPostScriptName: style.fontPostScriptName || null,
    fontWeight: style.fontWeight || null,
    fontSize: roundNumber(style.fontSize, 2),
    lineHeightPx: roundNumber(style.lineHeightPx, 2),
    lineHeightPercent: roundNumber(style.lineHeightPercent, 2),
    letterSpacing: roundNumber(style.letterSpacing, 2),
    textCase: style.textCase || null,
    textDecoration: style.textDecoration || null,
    textAlignHorizontal: style.textAlignHorizontal || null,
    textAlignVertical: style.textAlignVertical || null,
  });
}

function summarizeLayout(node) {
  return compactValue({
    bounds: summarizeBounds(node?.absoluteBoundingBox || node?.absoluteRenderBounds),
    layoutMode: node?.layoutMode || null,
    layoutWrap: node?.layoutWrap || null,
    primaryAxisSizingMode: node?.primaryAxisSizingMode || null,
    counterAxisSizingMode: node?.counterAxisSizingMode || null,
    primaryAxisAlignItems: node?.primaryAxisAlignItems || null,
    counterAxisAlignItems: node?.counterAxisAlignItems || null,
    itemSpacing: roundNumber(node?.itemSpacing, 2),
    paddingTop: roundNumber(node?.paddingTop, 2),
    paddingRight: roundNumber(node?.paddingRight, 2),
    paddingBottom: roundNumber(node?.paddingBottom, 2),
    paddingLeft: roundNumber(node?.paddingLeft, 2),
    layoutGrow: node?.layoutGrow ?? null,
    layoutAlign: node?.layoutAlign || null,
    clipsContent: typeof node?.clipsContent === 'boolean' ? node.clipsContent : null,
    constraints: node?.constraints || null,
  });
}

function summarizeComponentProperties(componentProperties) {
  if (!componentProperties || typeof componentProperties !== 'object') {
    return undefined;
  }

  const summarized = Object.entries(componentProperties)
    .slice(0, 12)
    .map(([name, value]) =>
      compactValue({
        name,
        type: value?.type || null,
        value: value?.value ?? null,
      }),
    )
    .filter(Boolean);

  return summarized.length > 0 ? summarized : undefined;
}

function truncateText(value, maxChars = MAX_TEXT_PREVIEW_CHARS) {
  const text = String(value || '');
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 14))}...[truncated]`;
}

function summarizeNodeTree(node, options = {}, state = { totalNodes: 0 }, depth = 0) {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (state.totalNodes >= options.maxTotalNodes) {
    return {
      truncated: true,
      reason: `maxTotalNodes=${options.maxTotalNodes}`,
    };
  }

  state.totalNodes += 1;

  const summary = compactValue({
    id: node.id || null,
    name: node.name || null,
    type: node.type || null,
    visible: typeof node.visible === 'boolean' ? node.visible : undefined,
    layout: summarizeLayout(node),
    opacity: roundNumber(node.opacity, 3),
    cornerRadius: roundNumber(node.cornerRadius, 2),
    rectangleCornerRadii: Array.isArray(node.rectangleCornerRadii)
      ? node.rectangleCornerRadii.map((entry) => roundNumber(entry, 2))
      : undefined,
    fills: summarizePaintList(node.fills),
    strokes: summarizePaintList(node.strokes),
    effects: summarizeEffects(node.effects),
    strokeWeight: roundNumber(node.strokeWeight, 2),
    characters: node.type === 'TEXT' ? truncateText(node.characters, MAX_TEXT_PREVIEW_CHARS) : undefined,
    textStyle: node.type === 'TEXT' ? summarizeTextStyle(node) : undefined,
    componentId: node.componentId || null,
    componentProperties: summarizeComponentProperties(node.componentProperties),
  }) || {};

  if (Array.isArray(node.children) && depth < options.maxDepth) {
    const children = node.children
      .slice(0, options.maxChildrenPerNode)
      .map((child) => summarizeNodeTree(child, options, state, depth + 1))
      .filter(Boolean);

    if (children.length > 0) {
      summary.children = children;
    }

    if (node.children.length > options.maxChildrenPerNode) {
      summary.truncatedChildren = node.children.length - options.maxChildrenPerNode;
    }
  }

  return summary;
}

function collectReferencedComponentIds(node, targetSet = new Set()) {
  if (!node || typeof node !== 'object') {
    return targetSet;
  }

  if (trimString(node.componentId)) {
    targetSet.add(trimString(node.componentId));
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child) => {
      collectReferencedComponentIds(child, targetSet);
    });
  }

  return targetSet;
}

function summarizeReferencedComponents(components = {}, componentIds = []) {
  return componentIds
    .slice(0, MAX_COMPONENT_REFERENCES)
    .map((componentId) => {
      const component = components?.[componentId];
      return compactValue({
        id: componentId,
        name: component?.name || null,
        key: component?.key || null,
        description: component?.description || null,
        componentSetId: component?.componentSetId || null,
      });
    })
    .filter(Boolean);
}

async function getFigmaFileSummary(input = {}, options = {}) {
  const target = resolveFigmaTarget(input);
  const depth = clampInteger(
    input.depth,
    1,
    6,
    2,
  );
  const response = await requestFigmaJson(`/files/${encodeURIComponent(target.fileKey)}`, {
    env: options.env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    params: {
      depth,
    },
  });

  const pages = Array.isArray(response.document?.children)
    ? response.document.children
        .filter((entry) => entry && entry.type === 'CANVAS')
        .slice(0, 20)
        .map((page) =>
          compactValue({
            id: page.id || null,
            name: page.name || null,
            type: page.type || null,
            childCount: Array.isArray(page.children) ? page.children.length : 0,
            bounds: summarizeBounds(page.absoluteBoundingBox),
            backgroundColor: summarizeColor(page.backgroundColor),
          }),
        )
        .filter(Boolean)
    : [];

  return compactValue({
    fileKey: target.fileKey,
    name: response.name || null,
    version: response.version || null,
    lastModified: response.lastModified || null,
    role: response.role || null,
    pageCount: pages.length,
    pages,
    requestedNodeIds: target.nodeIds,
  });
}

async function getFigmaNodeContext(input = {}, options = {}) {
  const target = resolveFigmaTarget(input);
  if (target.nodeIds.length === 0) {
    throw new Error(
      'Informe `nodeId`, `nodeIds` ou use uma `url` do Figma com `node-id` para extrair contexto da tela.',
    );
  }

  const maxDepth = clampInteger(
    input.maxDepth,
    1,
    8,
    DEFAULT_FIGMA_NODE_CONTEXT_DEPTH,
  );
  const maxChildrenPerNode = clampInteger(
    input.maxChildrenPerNode,
    1,
    24,
    DEFAULT_FIGMA_MAX_CHILDREN_PER_NODE,
  );
  const maxTotalNodes = clampInteger(
    input.maxTotalNodes,
    10,
    400,
    DEFAULT_FIGMA_MAX_TOTAL_NODES,
  );

  const response = await requestFigmaJson(`/files/${encodeURIComponent(target.fileKey)}/nodes`, {
    env: options.env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    params: {
      ids: target.nodeIds.join(','),
      depth: maxDepth,
    },
  });

  const nodes = target.nodeIds.map((nodeId) => {
    const payload = response.nodes?.[nodeId];
    if (!payload?.document) {
      return {
        nodeId,
        missing: true,
      };
    }

    const state = {
      totalNodes: 0,
    };
    const referencedComponentIds = [...collectReferencedComponentIds(payload.document)];

    return compactValue({
      nodeId,
      name: payload.document.name || null,
      type: payload.document.type || null,
      summary: summarizeNodeTree(
        payload.document,
        {
          maxDepth,
          maxChildrenPerNode,
          maxTotalNodes,
        },
        state,
      ),
      totalSummarizedNodes: state.totalNodes,
      referencedComponents: summarizeReferencedComponents(payload.components, referencedComponentIds),
    });
  });

  return compactValue({
    fileKey: target.fileKey,
    name: response.name || null,
    version: response.version || null,
    lastModified: response.lastModified || null,
    requestedNodeIds: target.nodeIds,
    nodes,
  });
}

async function getFigmaImageRefs(input = {}, options = {}) {
  const target = resolveFigmaTarget(input);
  if (target.nodeIds.length === 0) {
    throw new Error(
      'Informe `nodeId`, `nodeIds` ou use uma `url` do Figma com `node-id` para gerar referências de imagem.',
    );
  }

  const format = ['png', 'jpg', 'svg', 'pdf'].includes(trimString(input.format).toLowerCase())
    ? trimString(input.format).toLowerCase()
    : 'png';
  const scale = clampNumber(input.scale, 0.1, 4, 2);
  const useAbsoluteBounds = String(input.useAbsoluteBounds || '').trim().toLowerCase() === 'true'
    || input.useAbsoluteBounds === true;

  const response = await requestFigmaJson(`/images/${encodeURIComponent(target.fileKey)}`, {
    env: options.env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    params: {
      ids: target.nodeIds.join(','),
      format,
      scale,
      use_absolute_bounds: useAbsoluteBounds ? 'true' : 'false',
    },
  });

  return compactValue({
    fileKey: target.fileKey,
    requestedNodeIds: target.nodeIds,
    format,
    scale,
    useAbsoluteBounds,
    images: response.images || {},
    error: response.err || null,
  });
}

module.exports = {
  DEFAULT_FIGMA_API_BASE_URL,
  DEFAULT_FIGMA_NODE_CONTEXT_DEPTH,
  DEFAULT_FIGMA_MAX_CHILDREN_PER_NODE,
  DEFAULT_FIGMA_MAX_TOTAL_NODES,
  createFigmaApiUrl,
  detectFigmaTokenSource,
  getFigmaBridgeStatus,
  getFigmaFileSummary,
  getFigmaImageRefs,
  getFigmaNodeContext,
  normalizeFigmaApiBaseUrl,
  normalizeFigmaNodeId,
  normalizeFigmaNodeIds,
  parseFigmaUrl,
  readFigmaAccessToken,
  requestFigmaJson,
  resolveFigmaTarget,
};
