#!/usr/bin/env node

/**
 * Generate Postman Collection from Swagger/OpenAPI Specification
 * 
 * This script fetches the Swagger JSON from the running server
 * and converts it to a Postman Collection v2.1.0 format.
 * 
 * Usage:
 *   node scripts/generate-postman-collection.js [baseUrl]
 * 
 * Example:
 *   node scripts/generate-postman-collection.js http://localhost:3000
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_BASE_URL = 'http://localhost:3000';
const SWAGGER_ENDPOINT = '/api-docs.json';
const OUTPUT_FILE = path.join(__dirname, '..', 'Rhinox_Pay_API.postman_collection.json');

/**
 * Fetch Swagger JSON from server or file
 */
function fetchSwaggerJson(baseUrl, useFile = false) {
  // If using file mode, read from backend server output
  if (useFile) {
    const swaggerFile = path.join(__dirname, '..', 'backend', 'swagger-output.json');
    if (fs.existsSync(swaggerFile)) {
      try {
        const data = fs.readFileSync(swaggerFile, 'utf8');
        return Promise.resolve(JSON.parse(data));
      } catch (error) {
        throw new Error(`Failed to read Swagger file: ${error.message}`);
      }
    } else {
      throw new Error(`Swagger file not found: ${swaggerFile}\nRun the server and visit http://localhost:3000/api-docs.json to save it.`);
    }
  }

  // Otherwise fetch from server
  return new Promise((resolve, reject) => {
    const url = new URL(SWAGGER_ENDPOINT, baseUrl);
    const client = url.protocol === 'https:' ? https : http;

    client.get(url.href, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to fetch Swagger JSON: ${error.message}\nMake sure your server is running at ${baseUrl}`));
    });
  });
}

/**
 * Convert OpenAPI parameter to Postman variable
 */
function convertParameter(param, pathVars = []) {
  const postmanParam = {
    key: param.name,
    value: param.example || '',
    description: param.description || '',
    disabled: false,
  };

  // Check if it's a path parameter
  if (param.in === 'path' || pathVars.includes(param.name)) {
    postmanParam.value = `:${param.name}`;
  }

  return postmanParam;
}

/**
 * Convert OpenAPI schema to Postman body
 */
function convertRequestBody(requestBody, content) {
  if (!requestBody || !content) {
    return null;
  }

  const jsonContent = content['application/json'];
  if (!jsonContent || !jsonContent.schema) {
    return null;
  }

  // Generate example from schema
  const example = generateExampleFromSchema(jsonContent.schema);

  return {
    mode: 'raw',
    raw: JSON.stringify(example, null, 2),
    options: {
      raw: {
        language: 'json',
      },
    },
  };
}

/**
 * Generate example object from JSON schema
 */
function generateExampleFromSchema(schema, depth = 0) {
  if (depth > 5) return {}; // Prevent infinite recursion

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.type === 'object' && schema.properties) {
    const example = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      example[key] = generateExampleFromSchema(value, depth + 1);
    }
    return example;
  }

  if (schema.type === 'array' && schema.items) {
    return [generateExampleFromSchema(schema.items, depth + 1)];
  }

  // Default values based on type
  switch (schema.type) {
    case 'string':
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      return 'string';
    case 'number':
    case 'integer':
      return schema.minimum || 0;
    case 'boolean':
      return true;
    case 'object':
      return {};
    case 'array':
      return [];
    default:
      return null;
  }
}

/**
 * Convert OpenAPI path item to Postman request
 */
function convertPathToRequest(method, path, pathItem, baseUrl) {
  const operation = pathItem[method.toLowerCase()];
  if (!operation) return null;

  const request = {
    name: operation.summary || operation.operationId || `${method} ${path}`,
    request: {
      method: method.toUpperCase(),
      header: [],
      url: {
        raw: `{{baseUrl}}${path}`,
        host: ['{{baseUrl}}'],
        path: path.split('/').filter(Boolean),
      },
      description: operation.description || '',
    },
    response: [],
  };

  // Add Content-Type header for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    request.request.header.push({
      key: 'Content-Type',
      value: 'application/json',
    });
  }

  // Add Authorization header if security is required
  // Check both operation-level and global security
  const hasSecurity = operation.security && operation.security.length > 0;
  if (hasSecurity) {
    const hasBearerAuth = operation.security.some(sec => 
      sec && (sec.bearerAuth || Object.keys(sec).includes('bearerAuth'))
    );
    if (hasBearerAuth) {
      request.request.header.push({
        key: 'Authorization',
        value: 'Bearer {{accessToken}}',
        description: 'JWT access token',
      });
    }
  }

  // Convert parameters
  if (operation.parameters) {
    const queryParams = [];
    const pathParams = [];

    operation.parameters.forEach((param) => {
      if (param.in === 'query') {
        queryParams.push(convertParameter(param));
      } else if (param.in === 'path') {
        pathParams.push(param.name);
      }
    });

    // Handle path parameters - replace in URL path
    if (pathParams.length > 0) {
      request.request.url.path = request.request.url.path.map((segment) => {
        if (pathParams.includes(segment)) {
          return `:${segment}`;
        }
        return segment;
      });
    }

    if (queryParams.length > 0) {
      request.request.url.query = queryParams;
    }
  }

  // Convert request body
  if (operation.requestBody) {
    const body = convertRequestBody(
      operation.requestBody,
      operation.requestBody.content
    );
    if (body) {
      request.request.body = body;
    }
  }

  return request;
}

/**
 * Convert OpenAPI spec to Postman collection
 */
function convertToPostmanCollection(swaggerSpec) {
  const collection = {
    info: {
      _postman_id: 'rhinox-pay-api-collection-' + Date.now(),
      name: swaggerSpec.info.title || 'Rhinox Pay API',
      description: swaggerSpec.info.description || 'Complete Postman collection for Rhinox Pay Backend API',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _exporter_id: 'rhinox-pay',
    },
    item: [],
    variable: [
      {
        key: 'baseUrl',
        value: swaggerSpec.servers?.[0]?.url || 'http://localhost:3000',
        type: 'string',
      },
      {
        key: 'accessToken',
        value: '',
        type: 'string',
        description: 'JWT access token obtained from /api/auth/login or /api/auth/register',
      },
      {
        key: 'refreshToken',
        value: '',
        type: 'string',
        description: 'JWT refresh token obtained from /api/auth/login or /api/auth/register',
      },
    ],
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: [
            '// Auto-extract tokens from login/register responses',
            'if (pm.response && pm.response.json) {',
            '    try {',
            '        const json = pm.response.json();',
            '        if (json.data && json.data.accessToken) {',
            '            pm.collectionVariables.set("accessToken", json.data.accessToken);',
            '            console.log("✅ Access token set automatically");',
            '        }',
            '        if (json.data && json.data.refreshToken) {',
            '            pm.collectionVariables.set("refreshToken", json.data.refreshToken);',
            '            console.log("✅ Refresh token set automatically");',
            '        }',
            '    } catch (e) {',
            '        // Ignore errors',
            '    }',
            '}',
          ],
        },
      },
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            '// Auto-extract tokens from login/register responses',
            'if (pm.response && pm.response.json) {',
            '    try {',
            '        const json = pm.response.json();',
            '        if (json.data && json.data.accessToken) {',
            '            pm.collectionVariables.set("accessToken", json.data.accessToken);',
            '            console.log("✅ Access token set automatically");',
            '        }',
            '        if (json.data && json.data.refreshToken) {',
            '            pm.collectionVariables.set("refreshToken", json.data.refreshToken);',
            '            console.log("✅ Refresh token set automatically");',
            '        }',
            '    } catch (e) {',
            '        // Ignore errors',
            '    }',
            '}',
          ],
        },
      },
    ],
  };

  // Group endpoints by tags
  const tagGroups = {};

  // Process all paths
  for (const [path, pathItem] of Object.entries(swaggerSpec.paths || {})) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const request = convertPathToRequest(method, path, pathItem, swaggerSpec.servers?.[0]?.url);
      if (!request) continue;

      const operation = pathItem[method.toLowerCase()];
      const tags = operation.tags || ['Other'];

      // Add to tag groups
      tags.forEach((tag) => {
        if (!tagGroups[tag]) {
          tagGroups[tag] = [];
        }
        tagGroups[tag].push(request);
      });
    }
  }

  // Convert tag groups to Postman folders
  for (const [tagName, requests] of Object.entries(tagGroups)) {
    // Sort requests by name
    requests.sort((a, b) => a.name.localeCompare(b.name));

    collection.item.push({
      name: tagName,
      item: requests,
      description: swaggerSpec.tags?.find((t) => t.name === tagName)?.description || '',
    });
  }

  // Sort folders by name
  collection.item.sort((a, b) => a.name.localeCompare(b.name));

  return collection;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const useFile = args.includes('--file') || args.includes('-f');
  const baseUrl = args.find(arg => !arg.startsWith('-') && !arg.startsWith('--')) || DEFAULT_BASE_URL;

  if (useFile) {
    console.log('📄 Reading Swagger JSON from file...');
  } else {
    console.log(`🌐 Fetching Swagger JSON from: ${baseUrl}${SWAGGER_ENDPOINT}`);
  }

  try {
    // Fetch Swagger JSON
    const swaggerSpec = await fetchSwaggerJson(baseUrl, useFile);
    console.log('✅ Successfully loaded Swagger JSON');

    // Convert to Postman collection
    console.log('🔄 Converting to Postman collection...');
    const postmanCollection = convertToPostmanCollection(swaggerSpec);

    // Write to file
    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(postmanCollection, null, 2),
      'utf8'
    );

    console.log(`✅ Postman collection generated successfully!`);
    console.log(`📁 Output file: ${OUTPUT_FILE}`);
    console.log(`📊 Total folders: ${postmanCollection.item.length}`);
    console.log(
      `📊 Total requests: ${postmanCollection.item.reduce(
        (sum, folder) => sum + (folder.item?.length || 0),
        0
      )}`
    );
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Make sure your server is running and accessible at:', baseUrl);
    process.exit(1);
  }
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')) ||
                     process.argv[1].includes('generate-postman-collection.js');

if (isMainModule) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

