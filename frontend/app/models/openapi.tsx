import { client } from "../../client/client.gen";

export type OpenAPIJSONSchema = {
  type?: string;
  $ref?: string;
  allOf?: OpenAPIJSONSchema[];
  anyOf?: OpenAPIJSONSchema[];
  oneOf?: OpenAPIJSONSchema[];
  items?: OpenAPIJSONSchema;
  properties?: Record<string, OpenAPIJSONSchema>;
  additionalProperties?: OpenAPIJSONSchema | boolean;
  required?: string[];
  title?: string;
  description?: string;
  enum?: (string | number)[];
  const?: string | number | boolean;
  format?: string;
  pattern?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  min_length?: number;
  max_length?: number;
};

export type OpenAPIParameter = {
  name: string;
  in: "query" | "cookie" | "header" | "path";
  required: boolean;
  schema: OpenAPIJSONSchema;
};

export type OpenAPIMediaType = {
  schema: OpenAPIJSONSchema;
};

export type OpenAPIRequestBody = {
  content: Record<string, OpenAPIMediaType>;
  required?: boolean;
};

export type OpenAPIResponse = {
  description: string;
  content?: Record<string, OpenAPIMediaType>;
};

export type OpenAPIOperation = {
  tags?: string[];
  summary: string;
  operationId: string;
  security?: Record<string, string[]>[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
};

export type OpenAPIPathItem = {
  [method in "get" | "post" | "put" | "patch" | "delete"]?: OpenAPIOperation;
};

export type OpenAPISecurityScheme = {
  type: string;
  flows?: {
    password?: {
      scopes: Record<string, string>;
      tokenUrl: string;
    };
  };
};

export type OpenAPIJSON = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, OpenAPIPathItem>;
  components: {
    schemas: Record<string, OpenAPIJSONSchema>;
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
  };
}

export const openApiUrl = client.getConfig().baseUrl ?? "";

export async function getOpenApiJson(): Promise<OpenAPIJSON> {
  const res = await fetch(`${openApiUrl}/openapi.json`);
  return res.json();
}

function resolveSchemaRef(openApiJson: OpenAPIJSON, ref: string): OpenAPIJSONSchema | undefined {
  const prefix = '#/components/schemas/';
  if (!ref.startsWith(prefix)) {
    return undefined;
  }

  return openApiJson.components.schemas[ref.slice(prefix.length)];
}

export function expandOpenApiSchema(
  openApiJson: OpenAPIJSON,
  schema: OpenAPIJSONSchema,
  seenRefs: Set<string> = new Set(),
): OpenAPIJSONSchema {
  let expandedSchema: OpenAPIJSONSchema = { ...schema };

  if (schema.$ref) {
    const resolvedSchema = resolveSchemaRef(openApiJson, schema.$ref);
    if (resolvedSchema && !seenRefs.has(schema.$ref)) {
      seenRefs.add(schema.$ref);
      const { $ref: _ignoredRef, ...localOverrides } = schema;
      expandedSchema = {
        ...expandOpenApiSchema(openApiJson, resolvedSchema, seenRefs),
        ...localOverrides,
      };
      seenRefs.delete(schema.$ref);
    }
  }

  if (expandedSchema.allOf) {
    expandedSchema.allOf = expandedSchema.allOf.map((item) => expandOpenApiSchema(openApiJson, item, seenRefs));
  }
  if (expandedSchema.anyOf) {
    expandedSchema.anyOf = expandedSchema.anyOf.map((item) => expandOpenApiSchema(openApiJson, item, seenRefs));
  }
  if (expandedSchema.oneOf) {
    expandedSchema.oneOf = expandedSchema.oneOf.map((item) => expandOpenApiSchema(openApiJson, item, seenRefs));
  }
  if (expandedSchema.items) {
    expandedSchema.items = expandOpenApiSchema(openApiJson, expandedSchema.items, seenRefs);
  }
  if (expandedSchema.properties) {
    expandedSchema.properties = Object.fromEntries(
      Object.entries(expandedSchema.properties).map(([key, value]) => [key, expandOpenApiSchema(openApiJson, value, seenRefs)])
    );
  }
  if (expandedSchema.additionalProperties && typeof expandedSchema.additionalProperties !== 'boolean') {
    expandedSchema.additionalProperties = expandOpenApiSchema(openApiJson, expandedSchema.additionalProperties, seenRefs);
  }

  return expandedSchema;
}
