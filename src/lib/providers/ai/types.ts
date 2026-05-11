export interface AIMessage {
  role: "system" | "user";
  content: string;
}

export interface AIJsonRequest {
  messages: AIMessage[];
  jsonSchemaName: string;
  temperature?: number;
}

export interface AITextRequest {
  messages: AIMessage[];
  temperature?: number;
}

export interface AIProvider {
  readonly providerName: string;

  generateJson<T>(input: AIJsonRequest): Promise<T>;
  generateText(input: AITextRequest): Promise<string>;
}

