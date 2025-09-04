const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const SwaggerParser = require('@apidevtools/swagger-parser');

describe('OpenAPI Specification Validation', () => {
  const openApiDir = path.join(__dirname, '../../openapi');
  
  // Get all OpenAPI specification files
  const getOpenApiFiles = () => {
    if (!fs.existsSync(openApiDir)) {
      return [];
    }
    return fs.readdirSync(openApiDir)
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
      .map(file => path.join(openApiDir, file));
  };

  describe('OpenAPI File Structure Validation', () => {
    test.each(getOpenApiFiles())('should validate OpenAPI structure for %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      // Basic OpenAPI structure validation
      expect(spec).toHaveProperty('openapi');
      expect(spec).toHaveProperty('info');
      expect(spec).toHaveProperty('paths');
      
      // Version validation
      expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
      
      // Info object validation
      expect(spec.info).toHaveProperty('title');
      expect(spec.info).toHaveProperty('version');
      expect(typeof spec.info.title).toBe('string');
      expect(typeof spec.info.version).toBe('string');
      
      // Paths validation
      expect(typeof spec.paths).toBe('object');
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });

    test.each(getOpenApiFiles())('should have valid HTTP methods in %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      const validMethods = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch', 'trace'];
      
      Object.values(spec.paths).forEach(pathItem => {
        Object.keys(pathItem).forEach(method => {
          if (method !== 'parameters' && method !== 'summary' && method !== 'description') {
            expect(validMethods).toContain(method.toLowerCase());
          }
        });
      });
    });

    test.each(getOpenApiFiles())('should have proper response codes in %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      Object.values(spec.paths).forEach(pathItem => {
        Object.values(pathItem).forEach(operation => {
          if (operation.responses) {
            expect(typeof operation.responses).toBe('object');
            
            // Should have at least one success response (2xx)
            const responseCodes = Object.keys(operation.responses);
            const hasSuccessResponse = responseCodes.some(code => 
              code.startsWith('2') || code === 'default'
            );
            expect(hasSuccessResponse).toBe(true);
            
            // Validate response code format
            responseCodes.forEach(code => {
              if (code !== 'default') {
                expect(code).toMatch(/^\d{3}$/);
              }
            });
          }
        });
      });
    });
  });

  describe('OpenAPI Schema Validation with Swagger Parser', () => {
    test.each(getOpenApiFiles())('should pass Swagger Parser validation for %s', async (filePath) => {
      await expect(SwaggerParser.validate(filePath)).resolves.toBeTruthy();
    }, 30000);

    test.each(getOpenApiFiles())('should dereference successfully for %s', async (filePath) => {
      const api = await SwaggerParser.dereference(filePath);
      expect(api).toBeTruthy();
      expect(api.openapi).toBeTruthy();
      expect(api.info).toBeTruthy();
      expect(api.paths).toBeTruthy();
    }, 30000);
  });

  describe('Security Definitions Validation', () => {
    test.each(getOpenApiFiles())('should have proper security definitions in %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      if (spec.security) {
        expect(Array.isArray(spec.security)).toBe(true);
        
        // If security is defined, there should be securitySchemes in components
        if (spec.security.length > 0) {
          expect(spec.components).toHaveProperty('securitySchemes');
          
          // Validate each security requirement
          spec.security.forEach(securityRequirement => {
            Object.keys(securityRequirement).forEach(schemeName => {
              expect(spec.components.securitySchemes).toHaveProperty(schemeName);
            });
          });
        }
      }
    });
  });

  describe('Component Schema Validation', () => {
    test.each(getOpenApiFiles())('should have valid component schemas in %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      if (spec.components && spec.components.schemas) {
        Object.entries(spec.components.schemas).forEach(([schemaName, schema]) => {
          expect(typeof schema).toBe('object');
          expect(schemaName).toMatch(/^[a-zA-Z0-9_-]+$/); // Valid schema name
          
          if (schema.type) {
            const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
            expect(validTypes).toContain(schema.type);
          }
          
          // If it's an object type, it should have properties or additionalProperties
          if (schema.type === 'object') {
            expect(schema.properties || schema.additionalProperties).toBeTruthy();
          }
          
          // If it's an array type, it should have items
          if (schema.type === 'array') {
            expect(schema.items).toBeTruthy();
          }
        });
      }
    });
  });

  describe('Path Parameter Validation', () => {
    test.each(getOpenApiFiles())('should have matching path parameters in %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      Object.entries(spec.paths).forEach(([pathTemplate, pathItem]) => {
        // Extract path parameters from template
        const pathParams = [...pathTemplate.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
        
        Object.entries(pathItem).forEach(([, operation]) => {
          if (typeof operation === 'object' && operation.parameters) {
            const pathParamDefs = operation.parameters.filter(param => 
              param.in === 'path' || (param.$ref && param.$ref.includes('parameters'))
            );
            
            // All path parameters in template should be defined
            pathParams.forEach(pathParam => {
              const isDefined = pathParamDefs.some(def => 
                def.name === pathParam || (def.$ref && def.$ref.includes(pathParam))
              );
              expect(isDefined).toBe(true);
            });
            
            // All defined path parameters should be in template
            pathParamDefs.forEach(paramDef => {
              if (paramDef.name) {
                expect(pathParams).toContain(paramDef.name);
                expect(paramDef.required).toBe(true); // Path parameters must be required
              }
              // Skip validation for $ref parameters as they are resolved elsewhere
            });
          }
        });
      });
    });
  });

  describe('Response Content Type Validation', () => {
    test.each(getOpenApiFiles())('should have valid content types in responses for %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      // Valid MIME type patterns are checked with regex
      
      Object.values(spec.paths).forEach(pathItem => {
        Object.values(pathItem).forEach(operation => {
          if (operation.responses) {
            Object.values(operation.responses).forEach(response => {
              if (response.content) {
                Object.keys(response.content).forEach(contentType => {
                  // Should be a valid MIME type pattern
                  expect(contentType).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^]*$/);
                });
              }
            });
          }
        });
      });
    });
  });

  describe('Tag Validation', () => {
    test.each(getOpenApiFiles())('should have consistent tags in %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      const definedTags = new Set();
      if (spec.tags) {
        spec.tags.forEach(tag => {
          expect(tag).toHaveProperty('name');
          expect(typeof tag.name).toBe('string');
          definedTags.add(tag.name);
        });
      }
      
      const usedTags = new Set();
      Object.values(spec.paths).forEach(pathItem => {
        Object.values(pathItem).forEach(operation => {
          if (operation.tags) {
            operation.tags.forEach(tag => {
              usedTags.add(tag);
            });
          }
        });
      });
      
      // All used tags should be defined (if tags section exists)
      if (spec.tags && spec.tags.length > 0) {
        usedTags.forEach(usedTag => {
          expect(definedTags.has(usedTag)).toBe(true);
        });
      }
    });
  });

  describe('Server URL Validation', () => {
    test.each(getOpenApiFiles())('should have valid server URLs in %s', async (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content);
      
      if (spec.servers) {
        expect(Array.isArray(spec.servers)).toBe(true);
        expect(spec.servers.length).toBeGreaterThan(0);
        
        spec.servers.forEach(server => {
          expect(server).toHaveProperty('url');
          expect(typeof server.url).toBe('string');
          
          // URL should be valid format (http/https or relative)
          expect(server.url).toMatch(/^(https?:\/\/|\/)/);
          
          if (server.description) {
            expect(typeof server.description).toBe('string');
          }
        });
      }
    });
  });
});