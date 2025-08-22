import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIV3 } from 'openapi-types';

export class ToolGenerator {
  generateTools(schema: OpenAPIV3.Document): Tool[] {
    const tools: Tool[] = [];

    for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

      for (const method of methods) {
        const operation = pathItem[method] as OpenAPIV3.OperationObject;
        if (!operation) continue;

        const operationId = operation.operationId || `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const tool = this.createToolFromOperation(
          operationId,
          method,
          pathKey,
          operation,
          pathItem.parameters as OpenAPIV3.ParameterObject[] || []
        );

        tools.push(tool);
      }
    }

    return tools;
  }

  private createToolFromOperation(
    operationId: string,
    method: string,
    path: string,
    operation: OpenAPIV3.OperationObject,
    pathParameters: OpenAPIV3.ParameterObject[]
  ): Tool {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Collect all parameters
    const allParameters = [
      ...pathParameters,
      ...(operation.parameters as OpenAPIV3.ParameterObject[] || [])
    ];

    // Process parameters
    for (const param of allParameters) {
      if (param.in === 'cookie') continue; // Skip cookie parameters for now

      properties[param.name] = {
        type: this.getParameterType(param),
        description: param.description || `${param.in} parameter`,
      };

      if (param.required) {
        required.push(param.name);
      }
    }

    // Process request body if present
    const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
    if (requestBody && requestBody.content) {
      const jsonContent = requestBody.content['application/json'];
      if (jsonContent && jsonContent.schema) {
        properties.body = {
          type: 'object',
          description: requestBody.description || 'Request body',
          ...this.convertSchema(jsonContent.schema),
        };

        if (requestBody.required) {
          required.push('body');
        }
      }
    }

    return {
      name: operationId,
      description: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
      inputSchema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  }

  private getParameterType(param: OpenAPIV3.ParameterObject): string {
    if (param.schema) {
      const schema = param.schema as OpenAPIV3.SchemaObject;
      return schema.type || 'string';
    }
    return 'string';
  }

  private convertSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): any {
    if ('$ref' in schema) {
      // For now, treat references as generic objects
      return { type: 'object', description: 'Referenced schema' };
    }

    const converted: any = {
      type: schema.type || 'object',
    };

    if (schema.description) {
      converted.description = schema.description;
    }

    if (schema.properties) {
      converted.properties = {};
      for (const [key, prop] of Object.entries(schema.properties)) {
        converted.properties[key] = this.convertSchema(prop);
      }
    }

    if (schema.type === 'array' && 'items' in schema && schema.items) {
      converted.items = this.convertSchema(schema.items);
    }

    if (schema.required) {
      converted.required = schema.required;
    }

    if (schema.enum) {
      converted.enum = schema.enum;
    }

    return converted;
  }
}