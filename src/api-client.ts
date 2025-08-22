import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { OpenAPIV3 } from 'openapi-types';
import { ServerOptions } from './server';

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
    this.client = axios.create({
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...options.additionalHeaders,
      },
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

    // Process parameters
    for (const param of parameters) {
      const value = args[param.name];
      if (value === undefined && param.required) {
        throw new Error(`Required parameter ${param.name} is missing`);
      }

      if (value !== undefined) {
        switch (param.in) {
          case 'path':
            url = url.replace(`{${param.name}}`, encodeURIComponent(String(value)));
            break;
          case 'query':
            queryParams[param.name] = value;
            break;
          case 'header':
            headers[param.name] = String(value);
            break;
        }
      }
    }

    // Process request body
    if (requestBody && args.body !== undefined) {
      body = args.body;
    }

    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      params: queryParams,
      headers: { ...this.client.defaults.headers.common, ...headers },
      data: body,
    };

    try {
      const response = await this.client.request(config);
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`HTTP ${error.response?.status}: ${error.response?.statusText || error.message}`);
      }
      throw error;
    }
  }

  getOperations(): Map<string, OperationInfo> {
    return this.operations;
  }
}