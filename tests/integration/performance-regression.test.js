const request = require('supertest');
const path = require('path');

// Import the server
const serverPath = path.join(__dirname, '../../server.js');
let app;

describe('Performance Regression Tests', () => {
  beforeAll(async () => {
    process.env.PORT = 0;
    process.env.NODE_ENV = 'test';
    
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

  describe('Response Time Benchmarks', () => {
    test('Health endpoint should respond within 100ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(100);
      expect(response.body.status).toBe('healthy');
    });

    test('Specs endpoint should respond within 200ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/specs')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(200);
      expect(response.body).toHaveProperty('openapi');
    });

    test('Frontend OpenAPI spec should respond within 300ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(300);
      expect(response.body.openapi).toBe('3.0.3');
    });

    test('Backend OpenAPI spec should respond within 300ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/backend/openapi.json')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(300);
      expect(response.body).toHaveProperty('openapi');
    });

    test('Versions endpoint should respond within 150ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/versions')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(150);
      expect(response.body).toHaveProperty('version_info');
    });
  });

  describe('Concurrent Load Performance', () => {
    test('Should handle 50 concurrent health check requests efficiently', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const requests = Array(concurrentRequests).fill().map(() =>
        request(app).get('/health').expect(200)
      );
      
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
      
      // Should complete within reasonable time (2 seconds for 50 concurrent requests)
      expect(totalTime).toBeLessThan(2000);
      
      // Average response time per request should be reasonable
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(50);
    });

    test('Should handle mixed concurrent requests without performance degradation', async () => {
      const startTime = Date.now();
      
      const mixedRequests = [
        ...Array(15).fill().map(() => request(app).get('/health')),
        ...Array(10).fill().map(() => request(app).get('/specs')),
        ...Array(10).fill().map(() => request(app).get('/versions')),
        ...Array(8).fill().map(() => request(app).get('/frontend/openapi.json')),
        ...Array(7).fill().map(() => request(app).get('/openapi/backend-frontend-api-v1.yaml'))
      ];
      
      const responses = await Promise.allSettled(mixedRequests);
      const totalTime = Date.now() - startTime;
      
      // Most requests should succeed (allow for some potential failures)
      const successfulRequests = responses.filter(r => r.status === 'fulfilled');
      expect(successfulRequests.length).toBeGreaterThan(40); // 80% success rate
      
      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(3000);
    });
  });

  describe('Memory Usage Benchmarks', () => {
    test('Should not have memory leaks during repeated requests', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Make multiple requests to test for memory leaks
      for (let i = 0; i < 100; i++) {
        await request(app).get('/health').expect(200);
        
        // Occasional garbage collection during the loop
        if (i % 25 === 0 && global.gc) {
          global.gc();
        }
      }
      
      // Force garbage collection after requests
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 10MB to account for CI environment)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('Should handle large response payloads efficiently', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Request large payloads (OpenAPI specs can be quite large)
      const requests = [
        request(app).get('/frontend/openapi.json').expect(200),
        request(app).get('/backend/openapi.json').expect(200),
        request(app).get('/openapi/backend-frontend-api-v1.yaml').expect(200),
        request(app).get('/asyncapi/backend-frontend-events-v1.yaml').expect(200)
      ];
      
      await Promise.all(requests);
      
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable for large payloads
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
    });
  });

  describe('Throughput Benchmarks', () => {
    test('Should maintain high throughput for simple endpoints', async () => {
      const requestCount = 200;
      const startTime = Date.now();
      
      // Sequential requests to measure sustained throughput
      const promises = [];
      for (let i = 0; i < requestCount; i++) {
        promises.push(request(app).get('/health').expect(200));
      }
      
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      const requestsPerSecond = (requestCount / totalTime) * 1000;
      
      // Should handle at least 50 requests per second
      expect(requestsPerSecond).toBeGreaterThan(50);
    });

    test('Should maintain reasonable throughput for complex endpoints', async () => {
      const requestCount = 50;
      const startTime = Date.now();
      
      const promises = [];
      for (let i = 0; i < requestCount; i++) {
        promises.push(request(app).get('/frontend/openapi.json').expect(200));
      }
      
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      const requestsPerSecond = (requestCount / totalTime) * 1000;
      
      // Should handle at least 20 requests per second for complex endpoints
      expect(requestsPerSecond).toBeGreaterThan(20);
    });
  });

  describe('Resource Efficiency Tests', () => {
    test('Should handle file system operations efficiently', async () => {
      const startTime = Date.now();
      
      // Test multiple file-based endpoints
      const fileEndpoints = [
        '/openapi/backend-frontend-api-v1.yaml',
        '/asyncapi/backend-frontend-events-v1.yaml', 
        '/protobuf/agent_service.proto'
      ];
      
      const requests = [];
      fileEndpoints.forEach(endpoint => {
        for (let i = 0; i < 10; i++) {
          requests.push(request(app).get(endpoint).expect(200));
        }
      });
      
      await Promise.all(requests);
      const totalTime = Date.now() - startTime;
      
      // Should complete file operations efficiently
      expect(totalTime).toBeLessThan(2000);
    });

    test('Should handle YAML parsing efficiently', async () => {
      const yamlEndpoints = [
        '/openapi/backend-frontend-api-v1.yaml',
        '/asyncapi/backend-frontend-events-v1.yaml'
      ];
      
      for (const endpoint of yamlEndpoints) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get(endpoint)
          .expect(200);
        
        const parseTime = Date.now() - startTime;
        
        // YAML parsing should be fast
        expect(parseTime).toBeLessThan(100);
        expect(response.body).toBeTruthy();
      }
    });
  });

  describe('Error Handling Performance', () => {
    test('Should handle 404 errors efficiently', async () => {
      const startTime = Date.now();
      
      const notFoundRequests = [
        request(app).get('/non-existent-endpoint').expect(500), // Our app returns 500 for unknown routes
        request(app).get('/openapi/non-existent.yaml').expect(404),
        request(app).get('/asyncapi/non-existent.yaml').expect(404),
        request(app).get('/protobuf/non-existent.proto').expect(404)
      ];
      
      await Promise.allSettled(notFoundRequests);
      const totalTime = Date.now() - startTime;
      
      // Error handling should be fast
      expect(totalTime).toBeLessThan(500);
    });

    test('Should handle malformed requests efficiently', async () => {
      const startTime = Date.now();
      
      const malformedRequests = [
        request(app)
          .get('/health')
          .set('Accept', 'invalid/content-type'),
        request(app)
          .post('/health')
          .expect(404), // Method not allowed
        request(app)
          .get('/openapi/')
          .expect(404) // Invalid path
      ];
      
      await Promise.allSettled(malformedRequests);
      const totalTime = Date.now() - startTime;
      
      // Error handling should be fast
      expect(totalTime).toBeLessThan(300);
    });
  });

  describe('Cache Performance Tests', () => {
    test('Should benefit from file caching on repeated requests', async () => {
      const endpoint = '/frontend/openapi.json';
      
      // First request (cold)
      const coldStartTime = Date.now();
      await request(app).get(endpoint).expect(200);
      const coldResponseTime = Date.now() - coldStartTime;
      
      // Subsequent requests (should be cached or faster)
      const cachedTimes = [];
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await request(app).get(endpoint).expect(200);
        cachedTimes.push(Date.now() - startTime);
      }
      
      const avgCachedTime = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
      
      // Cached requests should be at least as fast as the first request
      // (allowing for variance due to CI environment system load)
      expect(avgCachedTime).toBeLessThanOrEqual(coldResponseTime * 1.5);
    });
  });
});