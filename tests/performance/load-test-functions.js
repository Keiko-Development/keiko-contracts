// Artillery processor functions for performance testing

const fs = require('fs');
const path = require('path');

module.exports = {
  // Setup function called at the start of the test
  setupTest: function(context, userEvents, done) {
    console.log('Starting performance test...');
    context.vars.startTime = Date.now();
    return done();
  },

  // Cleanup function called at the end of the test
  cleanupTest: function(context, userEvents, done) {
    const endTime = Date.now();
    const duration = endTime - context.vars.startTime;
    console.log(`Performance test completed in ${duration}ms`);
    return done();
  },

  // Custom metrics tracking
  trackResponseTime: function(requestParams, response, context, next) {
    const responseTime = response.timings.response;
    
    // Track slow responses
    if (responseTime > 1000) {
      console.warn(`Slow response detected: ${requestParams.url} took ${responseTime}ms`);
    }
    
    // Custom metrics
    context.vars.responseTime = responseTime;
    
    return next();
  },

  // Validate health endpoint response
  validateHealthResponse: function(requestParams, response, context, next) {
    const body = response.body;
    
    try {
      const jsonBody = typeof body === 'string' ? JSON.parse(body) : body;
      
      if (!jsonBody.status || jsonBody.status !== 'healthy') {
        console.error('Health check failed:', jsonBody);
        return next(new Error('Health check returned non-healthy status'));
      }
      
      if (!jsonBody.timestamp || !jsonBody.correlationId) {
        console.error('Health response missing required fields');
        return next(new Error('Health response missing required fields'));
      }
      
    } catch (error) {
      console.error('Failed to parse health response:', error);
      return next(error);
    }
    
    return next();
  },

  // Validate specs endpoint response
  validateSpecsResponse: function(requestParams, response, context, next) {
    try {
      const jsonBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
      
      const requiredFields = ['openapi', 'asyncapi', 'protobuf', 'frontend_spec', 'backend_spec'];
      
      for (const field of requiredFields) {
        if (!jsonBody[field]) {
          return next(new Error(`Specs response missing required field: ${field}`));
        }
      }
      
      // Validate arrays are not empty
      if (!Array.isArray(jsonBody.openapi) || jsonBody.openapi.length === 0) {
        return next(new Error('OpenAPI specs array is empty'));
      }
      
      if (!Array.isArray(jsonBody.asyncapi) || jsonBody.asyncapi.length === 0) {
        return next(new Error('AsyncAPI specs array is empty'));
      }
      
    } catch (error) {
      console.error('Failed to parse specs response:', error);
      return next(error);
    }
    
    return next();
  },

  // Validate OpenAPI specification response
  validateOpenAPIResponse: function(requestParams, response, context, next) {
    try {
      const jsonBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
      
      if (!jsonBody.openapi) {
        return next(new Error('Response missing openapi field'));
      }
      
      if (!jsonBody.info || !jsonBody.info.title || !jsonBody.info.version) {
        return next(new Error('Response missing required info fields'));
      }
      
      if (!jsonBody.paths || typeof jsonBody.paths !== 'object') {
        return next(new Error('Response missing or invalid paths'));
      }
      
    } catch (error) {
      console.error('Failed to parse OpenAPI response:', error);
      return next(error);
    }
    
    return next();
  },

  // Memory usage tracking
  trackMemoryUsage: function(context, next) {
    const memUsage = process.memoryUsage();
    
    // Log memory usage if it's high
    if (memUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
      console.warn(`High memory usage detected: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    }
    
    context.vars.memoryUsed = memUsage.heapUsed;
    
    return next();
  },

  // Custom error handling
  handleError: function(requestParams, response, context, next) {
    if (response.statusCode >= 400) {
      console.error(`HTTP Error ${response.statusCode} for ${requestParams.url}`);
      console.error('Response body:', response.body);
    }
    
    return next();
  },

  // Random delay between requests
  randomThink: function(context, next) {
    const delay = Math.random() * 3000; // 0-3 seconds
    setTimeout(next, delay);
  },

  // Custom assertion for CORS headers
  validateCORSHeaders: function(requestParams, response, context, next) {
    const headers = response.headers;
    
    if (requestParams.headers && requestParams.headers['Origin']) {
      if (!headers['access-control-allow-origin']) {
        return next(new Error('CORS headers missing in response'));
      }
    }
    
    return next();
  },

  // Generate performance report
  generateReport: function(stats, done) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        requests_completed: stats.requestsCompleted,
        requests_failed: stats.requestsCompleted - stats.requestsCompleted,
        response_times: {
          min: stats.latency.min,
          max: stats.latency.max,
          median: stats.latency.median,
          p95: stats.latency.p95,
          p99: stats.latency.p99
        },
        throughput: {
          requests_per_second: stats.rps ? stats.rps.mean : 0
        }
      }
    };
    
    // Write report to file
    const reportPath = path.join(__dirname, 'performance-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('Performance report written to:', reportPath);
    return done();
  }
};