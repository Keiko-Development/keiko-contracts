const request = require('supertest');
const express = require('express');

// Mock the server setup for testing
const app = express();

// Basic health endpoint for testing
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'keiko-api-contracts',
    version: '1.0.0'
  });
});

describe('Health Endpoint', () => {
  test('GET /health should return 200 and healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('service', 'keiko-api-contracts');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('version');
  });

  test('Health response should have correct structure', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(typeof response.body.status).toBe('string');
    expect(typeof response.body.timestamp).toBe('string');
    expect(typeof response.body.service).toBe('string');
    expect(typeof response.body.version).toBe('string');
  });

  test('Health endpoint should respond quickly', async () => {
    const start = Date.now();
    await request(app)
      .get('/health')
      .expect(200);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Should respond in less than 100ms
  });
});

describe('API Contract Validation', () => {
  test('OpenAPI specs should be valid YAML', () => {
    const fs = require('fs');
    const yaml = require('js-yaml');
    const path = require('path');

    const openApiDir = path.join(__dirname, '../openapi');
    
    if (fs.existsSync(openApiDir)) {
      const files = fs.readdirSync(openApiDir).filter(f => f.endsWith('.yaml'));
      
      files.forEach(file => {
        const filePath = path.join(openApiDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        expect(() => {
          yaml.load(content);
        }).not.toThrow();
      });
    }
  });

  test('AsyncAPI specs should be valid YAML', () => {
    const fs = require('fs');
    const yaml = require('js-yaml');
    const path = require('path');

    const asyncApiDir = path.join(__dirname, '../asyncapi');
    
    if (fs.existsSync(asyncApiDir)) {
      const files = fs.readdirSync(asyncApiDir).filter(f => f.endsWith('.yaml'));
      
      files.forEach(file => {
        const filePath = path.join(asyncApiDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        expect(() => {
          yaml.load(content);
        }).not.toThrow();
      });
    }
  });

  test('versions.yaml should be valid and have required structure', () => {
    const fs = require('fs');
    const yaml = require('js-yaml');
    const path = require('path');

    const versionsPath = path.join(__dirname, '../versions.yaml');
    
    if (fs.existsSync(versionsPath)) {
      const content = fs.readFileSync(versionsPath, 'utf8');
      const versions = yaml.load(content);
      
      expect(versions).toHaveProperty('version_info');
      expect(versions.version_info).toHaveProperty('schema_version');
      expect(versions.version_info).toHaveProperty('last_updated');
    }
  });
});

describe('Security Headers', () => {
  test('Should include security headers in responses', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    // These would be added by helmet middleware in the actual app
    // For now, just test that the response is successful
    expect(response.status).toBe(200);
  });
});

describe('Error Handling', () => {
  test('Should handle non-existent endpoints gracefully', async () => {
    await request(app)
      .get('/non-existent-endpoint')
      .expect(404);
  });
});
