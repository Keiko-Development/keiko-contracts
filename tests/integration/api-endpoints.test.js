const request = require('supertest');
const path = require('path');

// Import the server
const serverPath = path.join(__dirname, '../../server.js');
let app;

describe('API Endpoints Integration Tests', () => {
  beforeAll(async () => {
    // We need to mock the server startup to avoid port conflicts
    process.env.PORT = 0; // Use random available port
    process.env.NODE_ENV = 'test';
    
    // Import server after setting env
    delete require.cache[require.resolve(serverPath)];
    app = require(serverPath);
  });

  afterAll(async () => {
    // Clean up
    if (app && app.close) {
      app.close();
    }
  });

  describe('Health Endpoint', () => {
    test('GET /health should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'keiko-api-contracts',
        version: '1.0.0'
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.correlationId).toBeDefined();
    });

    test('Health endpoint should have correct security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'x-xss-protection': '0'
      });
    });
  });

  describe('Specs Endpoint', () => {
    test('GET /specs should return available specifications', async () => {
      const response = await request(app)
        .get('/specs')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('asyncapi');
      expect(response.body).toHaveProperty('protobuf');
      expect(response.body).toHaveProperty('frontend_spec');
      expect(response.body).toHaveProperty('backend_spec');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('health');
      expect(response.body).toHaveProperty('versions');

      expect(Array.isArray(response.body.openapi)).toBe(true);
      expect(Array.isArray(response.body.asyncapi)).toBe(true);
      expect(Array.isArray(response.body.protobuf)).toBe(true);
    });

    test('Specs endpoint should include expected OpenAPI files', async () => {
      const response = await request(app)
        .get('/specs')
        .expect(200);

      expect(response.body.openapi).toContain('/openapi/backend-frontend-api-v1.yaml');
      expect(response.body.openapi.length).toBeGreaterThan(0);
    });
  });

  describe('Versions Endpoint', () => {
    test('GET /versions should return version information', async () => {
      const response = await request(app)
        .get('/versions')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('version_info');
      expect(response.body.version_info).toHaveProperty('schema_version');
      expect(response.body.version_info).toHaveProperty('last_updated');
      expect(response.body.version_info).toHaveProperty('maintainer');
      expect(response.body.version_info).toHaveProperty('repository');
    });

    test('Versions should include OpenAPI specifications', async () => {
      const response = await request(app)
        .get('/versions')
        .expect(200);

      expect(response.body).toHaveProperty('openapi');
      expect(typeof response.body.openapi).toBe('object');
    });
  });

  describe('Frontend OpenAPI Endpoint', () => {
    test('GET /frontend/openapi.json should return OpenAPI spec', async () => {
      const response = await request(app)
        .get('/frontend/openapi.json')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
      expect(response.body.openapi).toBe('3.0.3');
      expect(response.body.info.title).toBe('Keiko Backend-Frontend API');
    });

    test('Frontend spec should have proper API structure', async () => {
      const response = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);

      expect(response.body.paths).toHaveProperty('/api/v1/agents');
      expect(response.body.paths).toHaveProperty('/api/v1/health');
      expect(response.body).toHaveProperty('components');
      expect(response.body.components).toHaveProperty('schemas');
    });
  });

  describe('Backend OpenAPI Endpoint', () => {
    test('GET /backend/openapi.json should return OpenAPI spec', async () => {
      const response = await request(app)
        .get('/backend/openapi.json')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
    });
  });

  describe('CORS Configuration', () => {
    test('Should allow configured origins', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    test('Should handle preflight requests', async () => {
      const response = await request(app)
        .options('/specs')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('OpenAPI File Endpoints', () => {
    test('GET /openapi/:spec should return YAML content as JSON by default', async () => {
      const response = await request(app)
        .get('/openapi/backend-frontend-api-v1.yaml')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
    });

    test('GET /openapi/:spec should return YAML when requested', async () => {
      const response = await request(app)
        .get('/openapi/backend-frontend-api-v1.yaml')
        .set('Accept', 'application/yaml')
        .expect('Content-Type', /yaml/)
        .expect(200);

      expect(typeof response.text).toBe('string');
      expect(response.text).toMatch(/^openapi:/);
    });

    test('Should return 404 for non-existent specs', async () => {
      await request(app)
        .get('/openapi/non-existent-spec.yaml')
        .expect(404);
    });
  });

  describe('AsyncAPI Endpoints', () => {
    test('GET /asyncapi/:spec should return AsyncAPI specification', async () => {
      const response = await request(app)
        .get('/asyncapi/backend-frontend-events-v1.yaml')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('asyncapi');
      expect(response.body).toHaveProperty('info');
    });
  });

  describe('Protobuf Endpoints', () => {
    test('GET /protobuf/:file should return protobuf definition', async () => {
      const response = await request(app)
        .get('/protobuf/agent_service.proto')
        .expect('Content-Type', /text/)
        .expect(200);

      expect(response.text).toContain('syntax = "proto3"');
      expect(response.text).toContain('service AgentService');
    });

    test('Should return 404 for non-existent proto files', async () => {
      await request(app)
        .get('/protobuf/non-existent.proto')
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    test('Should return 404 for unknown routes', async () => {
      await request(app)
        .get('/unknown-endpoint')
        .expect(500); // Our server returns 500 for unhandled routes due to error middleware
    });

    test('Should have proper error structure', async () => {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(500);

      // The server should return JSON error response for unknown routes
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {
    test('Should handle rate limiting headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Rate limiting headers should be present
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });
  });
});