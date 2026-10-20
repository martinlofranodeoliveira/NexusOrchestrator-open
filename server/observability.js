const client = require('prom-client');
const pino = require('pino');
const pinoHttp = require('pino-http');

// Configure Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});
register.registerMetric(httpRequestDurationMicroseconds);

const activeConnectionsGauge = new client.Gauge({
  name: 'nexus_active_connections',
  help: 'Number of active websocket connections',
});
register.registerMetric(activeConnectionsGauge);

const tasksGauge = new client.Gauge({
  name: 'nexus_tasks',
  help: 'Number of visible tasks by status',
  labelNames: ['status'],
});
register.registerMetric(tasksGauge);

const agentsGauge = new client.Gauge({
  name: 'nexus_agents',
  help: 'Number of agents by status',
  labelNames: ['status'],
});
register.registerMetric(agentsGauge);

const agentRunsGauge = new client.Gauge({
  name: 'nexus_agent_runs',
  help: 'Number of agent runs by execution phase',
  labelNames: ['phase'],
});
register.registerMetric(agentRunsGauge);

const meetingsCounter = new client.Counter({
  name: 'nexus_meetings_total',
  help: 'Total number of meetings started',
});
register.registerMetric(meetingsCounter);

const taskTransitionsCounter = new client.Counter({
  name: 'nexus_task_transitions_total',
  help: 'Total number of task transitions observed',
  labelNames: ['from_status', 'to_status'],
});
register.registerMetric(taskTransitionsCounter);

const reviewHandoffsCounter = new client.Counter({
  name: 'nexus_review_handoffs_total',
  help: 'Total number of automatic handoffs to review',
});
register.registerMetric(reviewHandoffsCounter);

const taskResetsCounter = new client.Counter({
  name: 'nexus_task_resets_total',
  help: 'Total number of automatic task resets or pool releases',
  labelNames: ['reason', 'status'],
});
register.registerMetric(taskResetsCounter);

const modelSelectionsCounter = new client.Counter({
  name: 'nexus_model_selections_total',
  help: 'Total number of model selections for autonomous runs',
  labelNames: ['model'],
});
register.registerMetric(modelSelectionsCounter);

const modelProviderSelectionsCounter = new client.Counter({
  name: 'nexus_model_provider_selections_total',
  help: 'Total number of provider and model selections for autonomous runs',
  labelNames: ['provider', 'model'],
});
register.registerMetric(modelProviderSelectionsCounter);

// Configure Pino logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

const loggerMiddleware = pinoHttp({
  logger,
  customSuccessMessage: function (req, res) {
    return 'request completed';
  },
  customErrorMessage: function (req, res, err) {
    return 'request errored';
  },
});

const metricsMiddleware = (req, res, next) => {
  if (req.url === '/metrics') {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.url;
    httpRequestDurationMicroseconds.labels(req.method, route, res.statusCode).observe(duration);
  });
  next();
};

const setupObservability = (app) => {
  app.use(metricsMiddleware);
  app.use(loggerMiddleware);

  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
    }
  });
};

function setLabeledGauge(gauge, counts) {
  gauge.reset();
  Object.entries(counts || {}).forEach(([label, value]) => {
    gauge.labels(label).set(Number(value) || 0);
  });
}

const metrics = {
  setActiveConnections(count) {
    activeConnectionsGauge.set(Number(count) || 0);
  },
  setTaskCounts(counts) {
    setLabeledGauge(tasksGauge, counts);
  },
  setAgentCounts(counts) {
    setLabeledGauge(agentsGauge, counts);
  },
  setRunCounts(counts) {
    setLabeledGauge(agentRunsGauge, counts);
  },
  trackMeeting() {
    meetingsCounter.inc();
  },
  trackTaskTransition(fromStatus, toStatus) {
    taskTransitionsCounter.labels(fromStatus || 'unknown', toStatus || 'unknown').inc();
  },
  trackReviewHandoff() {
    reviewHandoffsCounter.inc();
  },
  trackTaskReset(reason, status) {
    taskResetsCounter.labels(reason || 'unknown', status || 'unknown').inc();
  },
  trackModelSelection(model, provider) {
    modelSelectionsCounter.labels(model || 'unknown').inc();
    modelProviderSelectionsCounter
      .labels(provider || 'unknown', model || 'unknown')
      .inc();
  },
};

module.exports = {
  logger,
  metrics,
  setupObservability,
  register,
};
