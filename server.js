const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const promClient = require('prom-client');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Winston Logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'keiko-api-contracts' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Prometheus Metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const apiSpecDownloads = new promClient.Counter({
  name: 'api_spec_downloads_total',
  help: 'Total number of API specification downloads',
  labelNames: ['spec_type', 'spec_name']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(apiSpecDownloads);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per minute for sensitive endpoints
  message: {
    error: 'Rate limit exceeded for this endpoint, please try again later.',
    retryAfter: '1 minute'
  }
});

// Security & Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',  // Frontend
    'http://localhost:8000',  // Backend
    'http://localhost:3001',  // Frontend Dev
    'http://localhost:8001'   // Backend Dev
  ]
}));
app.use(express.json());
app.use(limiter);

// Request Tracing & Logging Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const correlationId = uuidv4();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  logger.info('Request started', {
    correlationId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route ? req.route.path : req.path;

    // Update Prometheus metrics
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });

    logger.info('Request completed', {
      correlationId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}s`,
      contentLength: res.get('Content-Length')
    });
  });

  next();
});

// Prometheus Metrics Endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
    logger.info('Metrics endpoint accessed', { correlationId: req.correlationId });
  } catch (error) {
    logger.error('Error serving metrics', {
      correlationId: req.correlationId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// Health Check
app.get('/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'keiko-api-contracts',
    version: '1.0.0',
    correlationId: req.correlationId
  };

  logger.info('Health check accessed', {
    correlationId: req.correlationId,
    status: 'healthy'
  });

  res.json(healthData);
});

// API Versions
app.get('/versions', (req, res) => {
  try {
    const versions = yaml.load(fs.readFileSync('./contracts/versions.yaml', 'utf8'));

    logger.info('Versions endpoint accessed', {
      correlationId: req.correlationId,
      versionsCount: Object.keys(versions).length
    });

    res.json(versions);
  } catch (error) {
    logger.error('Failed to load versions', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to load versions',
      correlationId: req.correlationId
    });
  }
});

// Frontend-spezifische OpenAPI-Spec (JSON)
app.get('/frontend/openapi.json', strictLimiter, (req, res) => {
  try {
    const content = fs.readFileSync('./contracts/openapi/backend-frontend-api-v1.yaml', 'utf8');
    const spec = yaml.load(content);

    // Track API spec downloads
    apiSpecDownloads.inc({ spec_type: 'openapi', spec_name: 'frontend' });

    logger.info('Frontend OpenAPI spec downloaded', {
      correlationId: req.correlationId,
      specSize: content.length,
      userAgent: req.get('User-Agent')
    });

    res.json(spec);
  } catch (error) {
    logger.error('Error loading frontend API spec', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to load frontend API spec',
      correlationId: req.correlationId
    });
  }
});

// Backend-spezifische OpenAPI-Spec (JSON)
app.get('/backend/openapi.json', strictLimiter, (req, res) => {
  try {
    const content = fs.readFileSync('./contracts/openapi/backend-frontend-api-v1.yaml', 'utf8');
    const spec = yaml.load(content);

    // Track API spec downloads
    apiSpecDownloads.inc({ spec_type: 'openapi', spec_name: 'backend' });

    logger.info('Backend OpenAPI spec downloaded', {
      correlationId: req.correlationId,
      specSize: content.length,
      userAgent: req.get('User-Agent')
    });

    res.json(spec);
  } catch (error) {
    logger.error('Error loading backend API spec', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to load backend API spec',
      correlationId: req.correlationId
    });
  }
});

// Generische OpenAPI-Specs
app.get('/openapi/:spec', (req, res) => {
  const specFile = req.params.spec;
  const filePath = path.join('./contracts/openapi', specFile);

  // Validate file path to prevent directory traversal
  if (specFile.includes('..') || specFile.includes('/') || !specFile.endsWith('.yaml')) {
    logger.warn('Invalid spec file requested', {
      correlationId: req.correlationId,
      specFile,
      ip: req.ip
    });
    return res.status(400).json({
      error: 'Invalid specification file name',
      correlationId: req.correlationId
    });
  }

  if (!fs.existsSync(filePath)) {
    logger.warn('Specification not found', {
      correlationId: req.correlationId,
      specFile,
      filePath
    });
    return res.status(404).json({
      error: 'Specification not found',
      correlationId: req.correlationId
    });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Track API spec downloads
    apiSpecDownloads.inc({ spec_type: 'openapi', spec_name: specFile });

    // Return as JSON or YAML based on Accept header
    if (req.headers.accept && req.headers.accept.includes('application/yaml')) {
      res.set('Content-Type', 'application/yaml');
      logger.info('OpenAPI spec downloaded as YAML', {
        correlationId: req.correlationId,
        specFile,
        specSize: content.length
      });
      res.send(content);
    } else {
      const spec = yaml.load(content);
      logger.info('OpenAPI spec downloaded as JSON', {
        correlationId: req.correlationId,
        specFile,
        specSize: content.length
      });
      res.json(spec);
    }
  } catch (error) {
    logger.error('Error parsing specification', {
      correlationId: req.correlationId,
      specFile,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to parse specification',
      correlationId: req.correlationId
    });
  }
});

// AsyncAPI-Specs
app.get('/asyncapi/:spec', (req, res) => {
  const specFile = req.params.spec;
  const filePath = path.join('./contracts/asyncapi', specFile);

  // Validate file path
  if (specFile.includes('..') || specFile.includes('/') || !specFile.endsWith('.yaml')) {
    logger.warn('Invalid AsyncAPI spec file requested', {
      correlationId: req.correlationId,
      specFile,
      ip: req.ip
    });
    return res.status(400).json({
      error: 'Invalid AsyncAPI specification file name',
      correlationId: req.correlationId
    });
  }

  if (!fs.existsSync(filePath)) {
    logger.warn('AsyncAPI specification not found', {
      correlationId: req.correlationId,
      specFile,
      filePath
    });
    return res.status(404).json({
      error: 'AsyncAPI specification not found',
      correlationId: req.correlationId
    });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Track API spec downloads
    apiSpecDownloads.inc({ spec_type: 'asyncapi', spec_name: specFile });

    if (req.headers.accept && req.headers.accept.includes('application/yaml')) {
      res.set('Content-Type', 'application/yaml');
      logger.info('AsyncAPI spec downloaded as YAML', {
        correlationId: req.correlationId,
        specFile,
        specSize: content.length
      });
      res.send(content);
    } else {
      const spec = yaml.load(content);
      logger.info('AsyncAPI spec downloaded as JSON', {
        correlationId: req.correlationId,
        specFile,
        specSize: content.length
      });
      res.json(spec);
    }
  } catch (error) {
    logger.error('Error parsing AsyncAPI specification', {
      correlationId: req.correlationId,
      specFile,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to parse AsyncAPI specification',
      correlationId: req.correlationId
    });
  }
});

// Protobuf-Files
app.get('/protobuf/:file', (req, res) => {
  const protoFile = req.params.file;
  const filePath = path.join('./contracts/protobuf', protoFile);

  // Validate file path
  if (protoFile.includes('..') || protoFile.includes('/') || !protoFile.endsWith('.proto')) {
    logger.warn('Invalid protobuf file requested', {
      correlationId: req.correlationId,
      protoFile,
      ip: req.ip
    });
    return res.status(400).json({
      error: 'Invalid protobuf file name',
      correlationId: req.correlationId
    });
  }

  if (!fs.existsSync(filePath)) {
    logger.warn('Protobuf file not found', {
      correlationId: req.correlationId,
      protoFile,
      filePath
    });
    return res.status(404).json({
      error: 'Protobuf file not found',
      correlationId: req.correlationId
    });
  }

  try {
    // Track API spec downloads
    apiSpecDownloads.inc({ spec_type: 'protobuf', spec_name: protoFile });

    logger.info('Protobuf file downloaded', {
      correlationId: req.correlationId,
      protoFile,
      fileSize: fs.statSync(filePath).size
    });

    res.set('Content-Type', 'text/plain');
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    logger.error('Error serving protobuf file', {
      correlationId: req.correlationId,
      protoFile,
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to serve protobuf file',
      correlationId: req.correlationId
    });
  }
});

// List all available specs
app.get('/specs', (req, res) => {
  try {
    const openapi = fs.readdirSync('./contracts/openapi').filter(f => f.endsWith('.yaml'));
    const asyncapi = fs.readdirSync('./contracts/asyncapi').filter(f => f.endsWith('.yaml'));
    const protobuf = fs.readdirSync('./contracts/protobuf').filter(f => f.endsWith('.proto'));

    const specsData = {
      openapi: openapi.map(f => `/openapi/${f}`),
      asyncapi: asyncapi.map(f => `/asyncapi/${f}`),
      protobuf: protobuf.map(f => `/protobuf/${f}`),
      frontend_spec: '/frontend/openapi.json',
      backend_spec: '/backend/openapi.json',
      metrics: '/metrics',
      health: '/health',
      versions: '/versions'
    };

    logger.info('Specs listing accessed', {
      correlationId: req.correlationId,
      totalSpecs: openapi.length + asyncapi.length + protobuf.length,
      openApiCount: openapi.length,
      asyncApiCount: asyncapi.length,
      protobufCount: protobuf.length
    });

    res.json(specsData);
  } catch (error) {
    logger.error('Error listing specifications', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to list specifications',
      correlationId: req.correlationId
    });
  }
});

// Error handling middleware
app.use((error, req, res, _next) => {
  logger.error('Unhandled error', {
    correlationId: req.correlationId,
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    correlationId: req.correlationId
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info('🚀 Keiko API Contracts Service started', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: logger.level,
    version: '1.0.0'
  });

  logger.info('📋 Available endpoints:', {
    endpoints: [
      'GET /health - Health check',
      'GET /metrics - Prometheus metrics',
      'GET /versions - API versions',
      'GET /specs - List all specifications',
      'GET /frontend/openapi.json - Frontend API spec',
      'GET /backend/openapi.json - Backend API spec',
      'GET /openapi/:spec - OpenAPI specifications',
      'GET /asyncapi/:spec - AsyncAPI specifications',
      'GET /protobuf/:file - Protobuf definitions'
    ]
  });
});
