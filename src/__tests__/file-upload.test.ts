import { ToolGenerator } from '../tool-generator';
import { APIClient } from '../api-client';
import { OpenAPIV3 } from 'openapi-types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('File Upload Support', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    // Create a temporary directory and test file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    testFilePath = path.join(tempDir, 'test-image.jpg');
    fs.writeFileSync(testFilePath, 'fake image content');
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('ToolGenerator', () => {
    it('should detect binary format fields as file uploads', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/upload': {
            post: {
              operationId: 'uploadFile',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: {
                          type: 'string',
                          format: 'binary',
                          description: 'File to upload'
                        },
                        metadata: {
                          type: 'string',
                          description: 'Additional metadata'
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      const generator = new ToolGenerator();
      const tools = generator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      expect(tool.name).toBe('uploadFile');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(tool.inputSchema.properties!.body).toBeDefined();
      
      const bodySchema = tool.inputSchema.properties!.body as any;
      expect(bodySchema.properties).toBeDefined();
      expect(bodySchema.properties.file).toBeDefined();
      
      // File field should be transformed to accept file path
      expect(bodySchema.properties.file.type).toBe('string');
      expect(bodySchema.properties.file.description).toContain('file path');
    });

    it('should handle array of binary files', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/upload-multiple': {
            post: {
              operationId: 'uploadMultiple',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        files: {
                          type: 'array',
                          items: {
                            type: 'string',
                            format: 'binary'
                          },
                          description: 'Multiple files to upload'
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      const generator = new ToolGenerator();
      const tools = generator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      const bodySchema = tool.inputSchema.properties!.body as any;
      expect(bodySchema.properties.files.type).toBe('array');
      expect(bodySchema.properties.files.items.type).toBe('string');
      expect(bodySchema.properties.files.items.description).toContain('file path');
    });

    it('should handle schema with $ref to CreateCreativeMultipartRequest', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v3/crt/creatives': {
            post: {
              operationId: 'createCreatives',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      $ref: '#/components/schemas/CreateCreativeMultipartRequest'
                    }
                  }
                }
              },
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        },
        components: {
          schemas: {
            CreateCreativeMultipartRequest: {
              type: 'object',
              properties: {
                creativeRequest: {
                  type: 'string',
                  description: 'JSON string containing creative metadata'
                },
                creativeFiles: {
                  type: 'array',
                  description: 'Array of creative files to upload',
                  items: {
                    type: 'string',
                    format: 'binary'
                  }
                }
              }
            }
          }
        }
      };

      const generator = new ToolGenerator();
      const tools = generator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      expect(tool.name).toBe('createCreatives');
      const bodySchema = tool.inputSchema.properties!.body as any;
      
      // creativeFiles should be transformed to accept file paths
      expect(bodySchema.properties.creativeFiles).toBeDefined();
      expect(bodySchema.properties.creativeFiles.type).toBe('array');
      expect(bodySchema.properties.creativeFiles.description).toContain('file path');
    });
  });

  describe('APIClient - File Upload Processing', () => {
    it('should process multipart form data with file uploads', async () => {
      const client = new APIClient({
        baseUrl: 'http://localhost:3000',
        timeout: 5000
      });

      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'http://localhost:3000' }],
        paths: {
          '/upload': {
            post: {
              operationId: 'uploadFile',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: {
                          type: 'string',
                          format: 'binary'
                        },
                        name: {
                          type: 'string'
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      await client.initialize(schema);

      // Test that FormData is created properly
      // Note: We can't easily test the actual HTTP call without a mock server,
      // but we can verify the method exists and accepts the right parameters
      const operations = client.getOperations();
      expect(operations.has('uploadFile')).toBe(true);

      const operation = operations.get('uploadFile');
      expect(operation).toBeDefined();
      expect(operation!.requestBody).toBeDefined();
    });
  });

  describe('Integration: Tool Generation + File Upload', () => {
    it('should generate tool that accepts file paths for binary fields', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Creative API', version: '3.0.0' },
        paths: {
          '/api/v3/crt/creatives': {
            post: {
              operationId: 'createCreatives',
              summary: 'Add creative',
              description: 'Create creatives with file uploads',
              requestBody: {
                required: true,
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        creativeRequest: {
                          type: 'string',
                          description: 'JSON metadata'
                        },
                        creativeFiles: {
                          type: 'array',
                          description: 'Creative files',
                          items: {
                            type: 'string',
                            format: 'binary'
                          }
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': { description: 'OK' }
              }
            }
          }
        }
      };

      const generator = new ToolGenerator();
      const tools = generator.generateTools(schema);

      expect(tools.length).toBe(1);
      const tool = tools[0];

      // Verify the tool was generated correctly
      expect(tool.name).toBe('createCreatives');
      expect(tool.description).toContain('Add creative');
      
      // Verify body schema
      const bodySchema = tool.inputSchema.properties!.body as any;
      expect(bodySchema).toBeDefined();
      expect(bodySchema.type).toBe('object');
      
      // Verify file field transformation
      expect(bodySchema.properties.creativeFiles).toBeDefined();
      expect(bodySchema.properties.creativeFiles.type).toBe('array');
      expect(bodySchema.properties.creativeFiles.description).toContain('file path');
      
      // Verify non-file fields remain unchanged
      expect(bodySchema.properties.creativeRequest).toBeDefined();
      expect(bodySchema.properties.creativeRequest.type).toBe('string');
      expect(bodySchema.properties.creativeRequest.description).toContain('JSON metadata');
    });
  });
});
