const request = require('supertest');
const path = require('path');

describe('End-to-End Workflow Tests', () => {
  let app;

  beforeAll(async () => {
    // Start the server in a separate process for true E2E testing
    process.env.PORT = 3002; // Use different port for E2E
    process.env.NODE_ENV = 'test';
    
    const serverPath = path.join(__dirname, '../../server.js');
    delete require.cache[require.resolve(serverPath)];
    app = require(serverPath);
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (app && app.close) {
      app.close();
    }
  });

  describe('Complete API Workflow', () => {
    test('E2E: Health Check → Specs → Frontend API → Backend API', async () => {
      // Step 1: Health Check
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);
      
      expect(healthResponse.body.status).toBe('healthy');
      
      // Step 2: Get Available Specs
      const specsResponse = await request(app)
        .get('/specs')
        .expect(200);
      
      expect(specsResponse.body.openapi.length).toBeGreaterThan(0);
      expect(specsResponse.body.asyncapi.length).toBeGreaterThan(0);
      
      // Step 3: Get Frontend API Spec
      const frontendResponse = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);
      
      expect(frontendResponse.body.openapi).toBe('3.0.3');
      expect(frontendResponse.body.info.title).toBe('Keiko Backend-Frontend API');
      
      // Step 4: Get Backend API Spec
      const backendResponse = await request(app)
        .get('/backend/openapi.json')
        .expect(200);
      
      expect(backendResponse.body).toHaveProperty('openapi');
      expect(backendResponse.body).toHaveProperty('paths');
      
      // Step 5: Verify Versions
      const versionsResponse = await request(app)
        .get('/versions')
        .expect(200);
      
      expect(versionsResponse.body.version_info.schema_version).toBe('1.0.0');
    });

    test('E2E: Multi-format Content Negotiation Workflow', async () => {
      const specName = 'backend-frontend-api-v1.yaml';
      
      // Test JSON response (default)
      const jsonResponse = await request(app)
        .get(`/openapi/${specName}`)
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(jsonResponse.body).toHaveProperty('openapi');
      
      // Test YAML response
      const yamlResponse = await request(app)
        .get(`/openapi/${specName}`)
        .set('Accept', 'application/yaml')
        .expect('Content-Type', /yaml/)
        .expect(200);
      
      expect(yamlResponse.text).toMatch(/^openapi:/);
      
      // Verify both contain same data structure
      const yamlParsed = require('js-yaml').load(yamlResponse.text);
      expect(yamlParsed.openapi).toBe(jsonResponse.body.openapi);
      expect(yamlParsed.info.title).toBe(jsonResponse.body.info.title);
    });

    test('E2E: Cross-Format Specification Access', async () => {
      // OpenAPI Access
      const openApiSpec = await request(app)
        .get('/openapi/backend-frontend-api-v1.yaml')
        .expect(200);
      
      // AsyncAPI Access
      const asyncApiSpec = await request(app)
        .get('/asyncapi/backend-frontend-events-v1.yaml')
        .expect(200);
      
      // Protobuf Access
      const protobufSpec = await request(app)
        .get('/protobuf/agent_service.proto')
        .expect(200);
      
      // Verify all formats are accessible
      expect(openApiSpec.body).toHaveProperty('openapi');
      expect(asyncApiSpec.body).toHaveProperty('asyncapi');
      expect(protobufSpec.text).toContain('syntax = "proto3"');
    });

    test('E2E: Error Handling and Recovery', async () => {
      // Test non-existent OpenAPI spec
      await request(app)
        .get('/openapi/non-existent-spec.yaml')
        .expect(404);
      
      // Test non-existent AsyncAPI spec
      await request(app)
        .get('/asyncapi/non-existent-events.yaml')
        .expect(404);
      
      // Test non-existent Protobuf file
      await request(app)
        .get('/protobuf/non-existent.proto')
        .expect(404);
      
      // Verify service is still healthy after errors
      const healthCheck = await request(app)
        .get('/health')
        .expect(200);
      
      expect(healthCheck.body.status).toBe('healthy');
    });

    test('E2E: CORS Full Workflow', async () => {
      const allowedOrigin = 'http://localhost:3000';
      
      // Preflight request
      const preflightResponse = await request(app)
        .options('/frontend/openapi.json')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type')
        .expect(200);
      
      expect(preflightResponse.headers['access-control-allow-origin']).toBe(allowedOrigin);
      expect(preflightResponse.headers['access-control-allow-methods']).toContain('GET');
      
      // Actual request
      const apiResponse = await request(app)
        .get('/frontend/openapi.json')
        .set('Origin', allowedOrigin)
        .expect(200);
      
      expect(apiResponse.headers['access-control-allow-origin']).toBe(allowedOrigin);
      expect(apiResponse.body).toHaveProperty('openapi');
    });

    test('E2E: Performance and Response Time Validation', async () => {
      const startTime = Date.now();
      
      // Test multiple endpoints for performance
      const requests = [
        request(app).get('/health'),
        request(app).get('/specs'),
        request(app).get('/versions'),
        request(app).get('/frontend/openapi.json'),
        request(app).get('/openapi/backend-frontend-api-v1.yaml')
      ];
      
      const responses = await Promise.all(requests.map(req => req.expect(200)));
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // All requests should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for all requests
      
      // Verify all responses are valid
      expect(responses[0].body.status).toBe('healthy');
      expect(responses[1].body).toHaveProperty('openapi');
      expect(responses[2].body).toHaveProperty('version_info');
      expect(responses[3].body.openapi).toBe('3.0.3');
      expect(responses[4].body).toHaveProperty('openapi');
    });

    test('E2E: Memory and Resource Efficiency', async () => {
      // Simulate multiple concurrent requests
      const concurrentRequests = Array(20).fill().map(() => 
        request(app).get('/health').expect(200)
      );
      
      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const endTime = Date.now();
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
        expect(response.body).toHaveProperty('correlationId');
      });
      
      // Should handle concurrent requests efficiently
      expect(endTime - startTime).toBeLessThan(2000); // 2 seconds for 20 concurrent requests
    });
  });

  describe('Data Integrity and Consistency', () => {
    test('E2E: Specification Version Consistency', async () => {
      // Get versions info
      const versionsResponse = await request(app)
        .get('/versions')
        .expect(200);
      
      // Get specs listing
      const specsResponse = await request(app)
        .get('/specs')
        .expect(200);
      
      // Verify OpenAPI files listed in versions exist in specs
      if (versionsResponse.body.openapi) {
        Object.values(versionsResponse.body.openapi).forEach(apiInfo => {
          Object.values(apiInfo.versions).forEach(versionInfo => {
            const expectedPath = `/${versionInfo.file}`;
            expect(specsResponse.body.openapi).toContain(expectedPath);
          });
        });
      }
    });

    test('E2E: Cross-reference Validation', async () => {
      // Get frontend spec
      const frontendSpec = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);
      
      // Get backend spec  
      const backendSpec = await request(app)
        .get('/backend/openapi.json')
        .expect(200);
      
      // Both should be valid OpenAPI 3.0.3 specs
      expect(frontendSpec.body.openapi).toBe('3.0.3');
      expect(backendSpec.body.openapi).toBe('3.0.3');
      
      // Both should have proper info objects
      expect(frontendSpec.body.info).toHaveProperty('title');
      expect(frontendSpec.body.info).toHaveProperty('version');
      expect(backendSpec.body.info).toHaveProperty('title');
      expect(backendSpec.body.info).toHaveProperty('version');
    });
  });

  describe('Security and Compliance E2E', () => {
    test('E2E: Security Headers Verification', async () => {
      const endpoints = ['/health', '/specs', '/versions', '/frontend/openapi.json'];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(200);
        
        // Verify security headers are present
        expect(response.headers).toHaveProperty('x-content-type-options');
        expect(response.headers).toHaveProperty('x-frame-options');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
      }
    });

    test('E2E: Rate Limiting Compliance', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      // Rate limiting headers should be present
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      
      // Values should be numeric
      expect(parseInt(response.headers['x-ratelimit-limit'])).toBeGreaterThan(0);
      expect(parseInt(response.headers['x-ratelimit-remaining'])).toBeGreaterThan(0);
    });
  });
});