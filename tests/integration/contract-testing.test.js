const request = require('supertest');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const SwaggerParser = require('@apidevtools/swagger-parser');

// Import the server
const serverPath = path.join(__dirname, '../../server.js');
let app;

describe('API Contract Testing', () => {
  beforeAll(async () => {
    process.env.PORT = 0;
    process.env.NODE_ENV = 'test';
    
    delete require.cache[require.resolve(serverPath)];
    app = require(serverPath);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (app && app.close) {
      app.close();
    }
  });

  describe('Frontend API Contract Validation', () => {
    test('should serve frontend OpenAPI spec that matches expected contract', async () => {
      const response = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);

      const spec = response.body;
      
      // Contract requirements
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Keiko Backend-Frontend API');
      expect(spec.info.version).toBe('1.0.0');
      
      // Required endpoints for frontend
      const requiredPaths = [
        '/api/v1/agents',
        '/api/v1/agents/{agentId}',
        '/api/v1/agents/{agentId}/call',
        '/api/v1/voice/process',
        '/api/v1/health'
      ];
      
      requiredPaths.forEach(requiredPath => {
        expect(spec.paths).toHaveProperty(requiredPath);
      });
      
      // Security should be properly configured
      expect(spec.security).toBeDefined();
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });

    test('should validate agent endpoints contract', async () => {
      const response = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);

      const spec = response.body;
      const agentsPath = spec.paths['/api/v1/agents'];
      
      // GET /agents should exist with proper responses
      expect(agentsPath.get).toBeDefined();
      expect(agentsPath.get.responses['200']).toBeDefined();
      expect(agentsPath.get.responses['200'].content['application/json']).toBeDefined();
      
      // POST /agents should exist
      expect(agentsPath.post).toBeDefined();
      expect(agentsPath.post.requestBody).toBeDefined();
      expect(agentsPath.post.responses['201']).toBeDefined();
      
      // Agent detail endpoint should have proper parameters
      const agentDetailPath = spec.paths['/api/v1/agents/{agentId}'];
      expect(agentDetailPath).toBeDefined();
      
      const getAgent = agentDetailPath.get;
      expect(getAgent.parameters).toBeDefined();
      const agentIdParam = getAgent.parameters.find(p => p.name === 'agentId');
      expect(agentIdParam).toBeDefined();
      expect(agentIdParam.in).toBe('path');
      expect(agentIdParam.required).toBe(true);
    });

    test('should validate schema definitions match expected contracts', async () => {
      const response = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);

      const spec = response.body;
      const schemas = spec.components.schemas;
      
      // Required schemas for frontend contract
      const requiredSchemas = [
        'Agent',
        'AgentList', 
        'CreateAgentRequest',
        'UpdateAgentRequest',
        'FunctionCallRequest',
        'FunctionCallResponse',
        'VoiceProcessResponse',
        'HealthCheck',
        'Error'
      ];
      
      requiredSchemas.forEach(schemaName => {
        expect(schemas).toHaveProperty(schemaName);
      });
      
      // Validate Agent schema structure
      const agentSchema = schemas.Agent;
      expect(agentSchema.type).toBe('object');
      expect(agentSchema.required).toContain('agent_id');
      expect(agentSchema.required).toContain('agent_type');
      expect(agentSchema.required).toContain('status');
      expect(agentSchema.required).toContain('capabilities');
      
      // Validate properties
      expect(agentSchema.properties.agent_id).toBeDefined();
      expect(agentSchema.properties.status).toBeDefined();
      expect(agentSchema.properties.status.enum).toContain('online');
      expect(agentSchema.properties.status.enum).toContain('offline');
    });
  });

  describe('Backend API Contract Validation', () => {
    test('should serve backend OpenAPI spec with valid contract', async () => {
      const response = await request(app)
        .get('/backend/openapi.json')
        .expect(200);

      const spec = response.body;
      
      // Backend contract requirements
      expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
      expect(spec.info).toHaveProperty('title');
      expect(spec.info).toHaveProperty('version');
      expect(spec.paths).toBeDefined();
      
      // Should be valid OpenAPI specification
      await expect(SwaggerParser.validate(spec)).resolves.toBeTruthy();
    }, 30000);
  });

  describe('AsyncAPI Contract Validation', () => {
    test('should serve valid AsyncAPI specifications', async () => {
      const specsResponse = await request(app)
        .get('/specs')
        .expect(200);
      
      const asyncApiSpecs = specsResponse.body.asyncapi;
      expect(Array.isArray(asyncApiSpecs)).toBe(true);
      expect(asyncApiSpecs.length).toBeGreaterThan(0);
      
      // Test each AsyncAPI specification
      for (const specPath of asyncApiSpecs) {
        const specResponse = await request(app)
          .get(specPath)
          .expect(200);
        
        const spec = specResponse.body;
        
        // AsyncAPI contract validation
        expect(spec.asyncapi).toBeDefined();
        expect(spec.asyncapi).toMatch(/^2\.\d+\.\d+$/);
        expect(spec.info).toBeDefined();
        expect(spec.info.title).toBeDefined();
        expect(spec.info.version).toBeDefined();
        
        // Should have channels or messages
        expect(spec.channels || spec.components?.messages).toBeDefined();
      }
    });

    test('should validate event schema contracts', async () => {
      const response = await request(app)
        .get('/asyncapi/backend-frontend-events-v1.yaml')
        .expect(200);
      
      const spec = response.body;
      
      // Event contract validation
      expect(spec.asyncapi).toBe('2.6.0');
      expect(spec.info.title).toBe('Keiko Backend-Frontend Events');
      
      // Should have proper channels
      expect(spec.channels).toBeDefined();
      
      // Validate common event patterns
      const channels = Object.keys(spec.channels);
      const hasAgentEvents = channels.some(ch => ch.includes('agent'));
      const hasFunctionEvents = channels.some(ch => ch.includes('function'));
      
      expect(hasAgentEvents || hasFunctionEvents).toBe(true);
      
      // Check message schemas
      Object.values(spec.channels).forEach(channel => {
        if (channel.subscribe && channel.subscribe.message) {
          const message = channel.subscribe.message;
          if (message.payload) {
            expect(message.payload).toHaveProperty('type');
          }
        }
        if (channel.publish && channel.publish.message) {
          const message = channel.publish.message;
          if (message.payload) {
            expect(message.payload).toHaveProperty('type');
          }
        }
      });
    });
  });

  describe('Protobuf Contract Validation', () => {
    test('should serve valid protobuf definitions', async () => {
      const specsResponse = await request(app)
        .get('/specs')
        .expect(200);
      
      const protobufSpecs = specsResponse.body.protobuf;
      expect(Array.isArray(protobufSpecs)).toBe(true);
      expect(protobufSpecs.length).toBeGreaterThan(0);
      
      // Test agent service proto
      const agentServiceResponse = await request(app)
        .get('/protobuf/agent_service.proto')
        .expect(200);
      
      const protoContent = agentServiceResponse.text;
      
      // Protobuf contract validation
      expect(protoContent).toContain('syntax = "proto3"');
      expect(protoContent).toContain('service AgentService');
      expect(protoContent).toContain('package');
      
      // Should have proper RPC definitions
      expect(protoContent).toMatch(/rpc\s+\w+/);
      
      // Should have message definitions
      expect(protoContent).toMatch(/message\s+\w+/);
    });

    test('should validate gRPC service contracts', async () => {
      const response = await request(app)
        .get('/protobuf/agent_service.proto')
        .expect(200);
      
      const protoContent = response.text;
      
      // Extract service definition
      const serviceMatch = protoContent.match(/service\s+(\w+)\s*\{([^}]+)\}/);
      expect(serviceMatch).toBeTruthy();
      
      const serviceName = serviceMatch[1];
      const serviceContent = serviceMatch[2];
      
      expect(serviceName).toBe('AgentService');
      
      // Should have RPC methods
      const rpcMethods = serviceContent.match(/rpc\s+(\w+)/g);
      expect(rpcMethods).toBeTruthy();
      expect(rpcMethods.length).toBeGreaterThan(0);
      
      // Common gRPC patterns
      rpcMethods.forEach(method => {
        expect(method).toMatch(/^rpc\s+[A-Z]\w+$/);
      });
    });
  });

  describe('Cross-Specification Consistency', () => {
    test('should have consistent versioning across specifications', async () => {
      const versionsResponse = await request(app)
        .get('/versions')
        .expect(200);
      
      const versions = versionsResponse.body;
      
      // Get frontend spec
      const frontendResponse = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);
      
      // Version consistency check
      expect(versions.version_info.schema_version).toBe('1.0.0');
      expect(frontendResponse.body.info.version).toBe('1.0.0');
      
      // All OpenAPI specs should have consistent versioning approach
      if (versions.openapi) {
        Object.values(versions.openapi).forEach(apiInfo => {
          Object.values(apiInfo.versions).forEach(versionInfo => {
            expect(versionInfo.status).toBe('active');
            expect(versionInfo).toHaveProperty('file');
            expect(versionInfo).toHaveProperty('release_date');
          });
        });
      }
    });

    test('should have consistent error response schemas', async () => {
      const frontendSpec = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);
      
      const backendSpec = await request(app)
        .get('/backend/openapi.json')
        .expect(200);
      
      // Both specs should have Error schema
      expect(frontendSpec.body.components.schemas.Error).toBeDefined();
      expect(backendSpec.body.components.schemas.Error).toBeDefined();
      
      // Error schemas should have consistent structure
      const frontendError = frontendSpec.body.components.schemas.Error;
      const backendError = backendSpec.body.components.schemas.Error;
      
      expect(frontendError.required).toContain('error');
      expect(frontendError.required).toContain('message');
      expect(frontendError.required).toContain('timestamp');
      
      // Should have similar property structures
      expect(frontendError.properties.error).toBeDefined();
      expect(frontendError.properties.message).toBeDefined();
      expect(frontendError.properties.timestamp).toBeDefined();
    });

    test('should validate API endpoint implementations match specifications', async () => {
      // Get the actual health endpoint response
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);
      
      // Get the frontend spec to check health endpoint definition
      const specResponse = await request(app)
        .get('/frontend/openapi.json')
        .expect(200);
      
      const spec = specResponse.body;
      const healthEndpoint = spec.paths['/api/v1/health'];
      
      if (healthEndpoint && healthEndpoint.get) {
        const responseSchema = healthEndpoint.get.responses['200'].content['application/json'].schema;
        
        if (responseSchema && responseSchema.$ref) {
          const schemaName = responseSchema.$ref.split('/').pop();
          const schema = spec.components.schemas[schemaName];
          
          if (schema && schema.required) {
            // Verify actual response matches schema requirements
            schema.required.forEach(requiredField => {
              expect(healthResponse.body).toHaveProperty(requiredField);
            });
          }
        }
      }
      
      // Verify response structure matches expected contract
      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body).toHaveProperty('timestamp');
      expect(healthResponse.body).toHaveProperty('service');
      expect(healthResponse.body.service).toBe('keiko-api-contracts');
    });
  });

  describe('API Response Format Consistency', () => {
    test('should return consistent JSON structure across endpoints', async () => {
      const endpoints = [
        '/health',
        '/specs', 
        '/versions',
        '/frontend/openapi.json'
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect('Content-Type', /json/)
          .expect(200);
        
        // Should be valid JSON
        expect(typeof response.body).toBe('object');
        expect(response.body).not.toBeNull();
        
        // Should not have undefined values in response
        const jsonString = JSON.stringify(response.body);
        expect(jsonString).not.toContain('undefined');
        expect(jsonString).not.toContain('null');
      }
    });

    test('should handle content negotiation consistently', async () => {
      const yamlEndpoints = [
        '/openapi/backend-frontend-api-v1.yaml',
        '/asyncapi/backend-frontend-events-v1.yaml'
      ];
      
      for (const endpoint of yamlEndpoints) {
        // Test JSON response (default)
        const jsonResponse = await request(app)
          .get(endpoint)
          .expect('Content-Type', /json/)
          .expect(200);
        
        expect(typeof jsonResponse.body).toBe('object');
        
        // Test YAML response
        const yamlResponse = await request(app)
          .get(endpoint)
          .set('Accept', 'application/yaml')
          .expect('Content-Type', /yaml/)
          .expect(200);
        
        expect(typeof yamlResponse.text).toBe('string');
        
        // Both should represent the same data
        const yamlParsed = yaml.load(yamlResponse.text);
        expect(yamlParsed).toEqual(jsonResponse.body);
      }
    });
  });
});