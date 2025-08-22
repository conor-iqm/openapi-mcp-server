import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { OpenAPIV3 } from 'openapi-types';

export class OpenAPISchemaLoader {
  async loadSchema(schemaPath: string): Promise<OpenAPIV3.Document> {
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const ext = path.extname(schemaPath).toLowerCase();
    
    let schema: any;
    
    if (ext === '.yaml' || ext === '.yml') {
      schema = yaml.parse(content);
    } else if (ext === '.json') {
      schema = JSON.parse(content);
    } else {
      throw new Error(`Unsupported schema file format: ${ext}. Only JSON and YAML are supported.`);
    }

    // Basic validation
    if (!schema.openapi && !schema.swagger) {
      throw new Error('Invalid OpenAPI schema: missing openapi or swagger field');
    }

    if (!schema.paths) {
      throw new Error('Invalid OpenAPI schema: missing paths');
    }

    // Convert Swagger 2.0 to OpenAPI 3.0 format if needed
    if (schema.swagger && schema.swagger.startsWith('2.')) {
      throw new Error('Swagger 2.0 is not supported. Please convert to OpenAPI 3.0+');
    }

    return schema as OpenAPIV3.Document;
  }
}