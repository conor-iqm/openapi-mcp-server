import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { OpenAPIV3 } from 'openapi-types';
import { ServerOptions } from './server';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export interface OperationInfo {
  method: string;
  path: string;
  operation: OpenAPIV3.OperationObject;
  parameters: OpenAPIV3.ParameterObject[];
  requestBody?: OpenAPIV3.RequestBodyObject;
}

export class APIClient {
  private client: AxiosInstance;
  private schema?: OpenAPIV3.Document;
  private operations: Map<string, OperationInfo> = new Map();
  private baseUrl?: string;

  constructor(private options: ServerOptions) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.additionalHeaders,
    };

    // Add basic authentication header if credentials are provided
    if (options.username && options.password) {
      const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    this.client = axios.create({
      timeout: options.timeout || 30000,
      headers,
    });
  }

  async initialize(schema: OpenAPIV3.Document): Promise<void> {
    this.schema = schema;
    this.baseUrl = this.options.baseUrl || this.getBaseUrl(schema);
    this.parseOperations(schema);
  }

  private getBaseUrl(schema: OpenAPIV3.Document): string {
    if (schema.servers && schema.servers.length > 0) {
      return schema.servers[0].url;
    }
    throw new Error('No server URL found in OpenAPI schema and no base URL provided');
  }

  private parseOperations(schema: OpenAPIV3.Document): void {
    for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

      for (const method of methods) {
        const operation = pathItem[method] as OpenAPIV3.OperationObject;
        if (!operation) continue;

        const operationId = operation.operationId || `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Collect parameters from path and operation
        const parameters: OpenAPIV3.ParameterObject[] = [];

        if (pathItem.parameters) {
          parameters.push(...(pathItem.parameters as OpenAPIV3.ParameterObject[]));
        }

        if (operation.parameters) {
          parameters.push(...(operation.parameters as OpenAPIV3.ParameterObject[]));
        }

        this.operations.set(operationId, {
          method: method.toUpperCase(),
          path: pathKey,
          operation,
          parameters,
          requestBody: operation.requestBody as OpenAPIV3.RequestBodyObject | undefined,
        });
      }
    }
  }

  async executeOperation(operationId: string, args: Record<string, any>): Promise<any> {
    const operationInfo = this.operations.get(operationId);
    if (!operationInfo) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const { method, path, parameters, requestBody } = operationInfo;

    // Build URL with path parameters
    let url = this.baseUrl + path;
    const queryParams: Record<string, any> = {};
    const headers: Record<string, string> = {};
    let body: any = undefined;

    // Validate and process parameters
    const missingRequiredParams: string[] = [];
    
    for (const param of parameters) {
      const value = args[param.name];
      
      if (value === undefined || value === null) {
        if (param.required) {
          missingRequiredParams.push(`${param.name} (${param.in})`);
        }
        continue;
      }

      // Type validation and conversion
      const processedValue = this.processParameterValue(param, value);

      switch (param.in) {
        case 'path':
          url = url.replace(`{${param.name}}`, encodeURIComponent(String(processedValue)));
          break;
        case 'query':
          queryParams[param.name] = processedValue;
          break;
        case 'header':
          headers[param.name] = String(processedValue);
          break;
      }
    }

    if (missingRequiredParams.length > 0) {
      throw new Error(`Missing required parameters: ${missingRequiredParams.join(', ')}`);
    }

    // Process request body with content type detection
    if (requestBody && args.body !== undefined) {
      const contentType = this.determineContentType(requestBody, headers);
      
      // Handle multipart/form-data separately for file uploads
      if (contentType === 'multipart/form-data') {
        const formData = await this.processMultipartFormData(args.body, requestBody);
        body = formData;
        // Let form-data set its own Content-Type with boundary
        // Remove any existing Content-Type header
        delete headers['Content-Type'];
        delete headers['content-type'];
        // FormData will set the correct headers automatically
      } else {
        body = this.processRequestBody(args.body, contentType);
        
        if (contentType && !headers['Content-Type']) {
          headers['Content-Type'] = contentType;
        }
      }
    }

    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      params: queryParams,
      headers: { ...(this.client.defaults.headers.common || {}), ...headers },
      data: body,
    };

    // If body is FormData, merge its headers
    if (body instanceof FormData) {
      config.headers = {
        ...config.headers,
        ...body.getHeaders()
      };
    }

    try {
      const response = await this.client.request(config);
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        url: response.config.url,
        method: response.config.method?.toUpperCase(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorDetails = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
        };
        
        throw new Error(`HTTP ${errorDetails.status}: ${errorDetails.statusText || errorDetails.message} - ${JSON.stringify(errorDetails.data || {})}`);
      }
      throw error;
    }
  }

  private processParameterValue(param: OpenAPIV3.ParameterObject, value: any): any {
    if (!param.schema) return value;
    
    const schema = param.schema as OpenAPIV3.SchemaObject;
    
    // Type conversion based on schema
    switch (schema.type) {
      case 'integer':
      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Parameter ${param.name} must be a valid number, got: ${value}`);
        }
        return num;
      }
      
      case 'boolean': {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'true') return true;
          if (value.toLowerCase() === 'false') return false;
        }
        throw new Error(`Parameter ${param.name} must be a boolean, got: ${value}`);
      }
      
      case 'array':
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          // Try to parse as JSON array or comma-separated values
          try {
            return JSON.parse(value);
          } catch {
            return value.split(',').map(v => v.trim());
          }
        }
        throw new Error(`Parameter ${param.name} must be an array, got: ${value}`);
      
      default:
        return String(value);
    }
  }

  private determineContentType(requestBody: OpenAPIV3.RequestBodyObject, headers: Record<string, string>): string | undefined {
    // Check if Content-Type is already set
    const existingContentType = headers['Content-Type'] || headers['content-type'];
    if (existingContentType) return existingContentType;
    
    // Determine from request body content types
    const contentTypes = Object.keys(requestBody.content || {});
    
    // Prefer JSON, then others
    if (contentTypes.includes('application/json')) return 'application/json';
    if (contentTypes.includes('application/xml')) return 'application/xml';
    if (contentTypes.includes('text/xml')) return 'text/xml';
    if (contentTypes.includes('application/x-www-form-urlencoded')) return 'application/x-www-form-urlencoded';
    if (contentTypes.includes('multipart/form-data')) return 'multipart/form-data';
    
    return contentTypes[0];
  }

  private processRequestBody(body: any, contentType?: string): any {
    if (!contentType) return body;
    
    switch (contentType) {
      case 'application/json':
        return typeof body === 'string' ? JSON.parse(body) : body;
      
      case 'application/x-www-form-urlencoded':
        if (typeof body === 'object' && body !== null) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(body)) {
            params.append(key, String(value));
          }
          return params.toString();
        }
        return body;
      
      default:
        return body;
    }
  }

  /**
   * Check if a schema field represents a file upload
   */
  private isFileField(schema: any): boolean {
    if (!schema) return false;
    
    // Check for binary format
    if (schema.format === 'binary') return true;
    
    // Check for array of binary (format can be at array level or items level)
    if (schema.type === 'array') {
      // Some schemas put format at array level (non-standard but happens)
      if (schema.format === 'binary') return true;
      // Standard: check items
      if (schema.items?.format === 'binary') return true;
    }
    
    // Check in description for file path hints (from transformed schemas)
    const description = schema.description?.toLowerCase() || '';
    return description.includes('file path') || description.includes('filepath');
  }

  /**
   * Get schema for a request body field
   */
  private getRequestBodySchema(requestBody: OpenAPIV3.RequestBodyObject, contentType: string): any {
    const content = requestBody.content?.[contentType];
    if (!content?.schema) return null;
    
    return this.resolveSchemaReference(content.schema);
  }

  /**
   * Resolve a schema reference to its actual definition
   */
  private resolveSchemaReference(schema: any): any {
    if (!schema) return null;
    
    if ('$ref' in schema) {
      const ref = schema.$ref;
      
      // Handle JSON Schema references like #/components/schemas/SchemaName
      if (ref.startsWith('#/')) {
        const parts = ref.substring(2).split('/'); // Remove '#/' and split
        let current: any = this.schema;
        
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            console.error(`[File Upload Debug] Failed to resolve $ref: ${ref} at part: ${part}`);
            return schema;
          }
        }
        
        console.error('[File Upload Debug] Resolved $ref:', ref, 'to:', Object.keys(current.properties || {}));
        return current;
      }
      
      // Return the schema as-is if we can't resolve it
      return schema;
    }
    
    return schema;
  }

  /**
   * Process multipart/form-data with file uploads
   */
  private async processMultipartFormData(body: any, requestBody?: OpenAPIV3.RequestBodyObject): Promise<FormData> {
    const formData = new FormData();
    
    if (!body || typeof body !== 'object') {
      throw new Error('Request body must be an object for multipart/form-data');
    }

    // Get schema for the request body
    const schema = requestBody ? this.getRequestBodySchema(requestBody, 'multipart/form-data') : null;
    const properties = schema?.properties || {};
    
    console.error('[File Upload Debug] Processing multipart form data');
    console.error('[File Upload Debug] Body keys:', Object.keys(body));
    console.error('[File Upload Debug] Schema properties:', Object.keys(properties));

    for (const [key, value] of Object.entries(body)) {
      const fieldSchema = properties[key];
      const isFile = this.isFileField(fieldSchema);
      
      console.error(`[File Upload Debug] Field "${key}": isFile=${isFile}, value type=${typeof value}, isArray=${Array.isArray(value)}`);
      if (fieldSchema) {
        console.error(`[File Upload Debug] Field "${key}" schema:`, JSON.stringify(fieldSchema, null, 2));
      }

      if (isFile && value) {
        // Handle file upload(s)
        if (Array.isArray(value)) {
          // Multiple files
          for (const filePath of value) {
            if (typeof filePath === 'string') {
              await this.appendFileToFormData(formData, key, filePath);
            } else {
              throw new Error(`File path must be a string, got: ${typeof filePath}`);
            }
          }
        } else if (typeof value === 'string') {
          // Single file
          await this.appendFileToFormData(formData, key, value);
        } else {
          throw new Error(`File path must be a string, got: ${typeof value}`);
        }
      } else {
        // Regular field
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    }

    return formData;
  }

  /**
   * Append a file to FormData from a file path
   */
  private async appendFileToFormData(formData: FormData, fieldName: string, filePath: string): Promise<void> {
    console.error(`[File Upload Debug] Appending file: field="${fieldName}", path="${filePath}"`);
    
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file stats to validate it's a file
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Create read stream
    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);

    // Append to form data
    formData.append(fieldName, fileStream, {
      filename: fileName,
      contentType: this.getMimeType(filePath)
    });
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.xml': 'text/xml',
      '.txt': 'text/plain'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  getOperations(): Map<string, OperationInfo> {
    return this.operations;
  }
}