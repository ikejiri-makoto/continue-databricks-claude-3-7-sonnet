# Continue VS Code Extension - LLM Integration for Providers

This directory contains the implementation files for all LLM providers supported by the Continue VS Code extension. Each provider implementation extends the `BaseLLM` class and implements the necessary methods to interact with the respective LLM API.

## Directory Structure

```
core/llm/llms/
├── Provider.ts           # Single-file provider implementations
└── Provider/             # Modular provider implementations with supporting modules
    ├── config.ts         # Configuration management
    ├── errors.ts         # Error handling
    ├── helpers.ts        # Helper functions
    ├── messages.ts       # Message formatting
    ├── streaming.ts      # Stream processing
    ├── toolcalls.ts      # Tool call handling
    └── types/            # Provider-specific types
```

## Provider Implementation Patterns

The framework supports two main patterns for implementing LLM providers:

### 1. Single-File Implementation

For simpler providers, a single file approach works well:
```
llms/
└── SimpleProvider.ts
```

This approach is suitable when:
- The provider has straightforward API requirements
- There's minimal need for specialized processing
- The implementation is relatively compact

### 2. Modular Implementation

For complex providers, a modular approach with clear separation of concerns:
```
llms/
├── ComplexProvider.ts     # Main orchestrator class
└── ComplexProvider/       # Supporting modules
    ├── config.ts          # Configuration management
    ├── errors.ts          # Error handling
    ├── helpers.ts         # Helper functions
    ├── messages.ts        # Message formatting
    ├── streaming.ts       # Stream processing
    ├── toolcalls.ts       # Tool call handling
    └── types/             # Provider-specific types
```

This approach is preferred when:
- The provider requires complex processing logic
- Different aspects of the provider have distinct responsibilities
- The implementation benefits from code organization and reuse
- Type safety and maintainability are high priorities

## Orchestrator Pattern for Complex Providers

For complex providers like Databricks, the framework recommends using the orchestrator pattern to achieve clear responsibility separation:

1. **Main Provider Class as Orchestrator**:
   - Acts as a coordinator between specialized modules
   - Delegates detailed implementation to appropriate modules
   - Maintains high-level flow control and error handling
   - Implements BaseLLM interface methods

2. **Specialized Modules with Clear Responsibilities**:
   - Configuration Management: Handles API settings, validation, timeouts
   - Error Handling: Processes API errors, implements retry logic
   - Message Formatting: Converts between standard and provider-specific formats
   - Streaming: Processes chunked responses and manages streaming state
   - Tool Calls: Handles tool invocation and result processing
   - Helper Utilities: Provides shared functionality for other modules

3. **State Management**:
   - Clear ownership of state between modules
   - Immutable update patterns for state changes
   - Preservation of state during error recovery
   - Type-safe state interfaces

4. **Interface Standardization**:
   - Well-defined interfaces between modules
   - Consistent parameter and return types
   - Clear documentation of module responsibilities
   - Minimized dependencies between modules

This pattern promotes maintainability, testability, and code reuse while keeping the codebase organized and easy to understand. The Databricks implementation serves as a reference example of this pattern.

## Implementing a New Provider

When implementing a new LLM provider, follow these steps:

1. **Create the Provider File**:
   - Create a new file in the `llms/` directory named `ProviderName.ts`
   - For complex providers, create a directory named `ProviderName/` with supporting modules

2. **Extend BaseLLM**:
   ```typescript
   import { BaseLLM } from "../index.js";
   import { LLMOptions } from "../../index.js";

   class ProviderName extends BaseLLM {
     static providerName = "provider-name";
     static defaultOptions: Partial<LLMOptions> = {
       model: "default-model",
       contextLength: 16000,
       completionOptions: {
         model: "default-model",
         maxTokens: 1000,
         temperature: 0.7,
       },
       capabilities: {
         // Provider capabilities
         tools: true
       }
     };

     constructor(options: LLMOptions) {
       super(options);
       // Provider-specific initialization
     }

     // Implement required methods...
   }

   export default ProviderName;
   ```

3. **Implement Required Methods**:
   - `_streamComplete`: Streaming completion for plain text prompts
   - `_streamChat`: Streaming completion for chat interfaces
   - Any other provider-specific methods

4. **Add Capability Detection**:
   - Update `autodetect.ts` to include capability detection for the new provider
   - Include the provider in `toolSupport.ts` if it supports tools/agents

5. **Test the Implementation**:
   - Create appropriate test cases to verify functionality
   - Test with the Continue extension to ensure proper integration

## Agent and Tool Support

To implement tool/agent support for a provider:

1. **Add Tool Support Declaration**:
   ```typescript
   static defaultOptions: Partial<LLMOptions> = {
     // ...
     capabilities: {
       tools: true
     }
   };
   ```

2. **Update `toolSupport.ts`**:
   ```typescript
   export const PROVIDER_TOOL_SUPPORT: Record<string, boolean> = {
     // ...
     "provider-name": true
   };
   ```

3. **Implement Tool Call Handling**:
   Ensure the provider correctly handles tool calls in the streaming implementation:
   ```typescript
   protected async *_streamChat(
     messages: ChatMessage[],
     signal: AbortSignal,
     options: CompletionOptions,
   ): AsyncGenerator<ChatMessage> {
     // Implement tool handling...
   }
   ```

4. **Handle Tool Arguments Safely**:
   Use the utility functions for proper tool argument handling:
   ```typescript
   import { repairToolArguments } from "../utils/toolUtils.js";
   
   // Fix potentially malformed tool arguments
   const repairedArgs = repairToolArguments(rawArgs);
   ```

## Best Practices for Provider Implementations

### Error Handling

Implement robust error handling with appropriate retries:

```typescript
try {
  // API call
} catch (error: unknown) {
  const errorMessage = getErrorMessage(error);
  
  if (isConnectionError(error) && retryCount < maxRetries) {
    // Implement retry with exponential backoff
    const backoffTime = Math.min(initialBackoff * Math.pow(2, retryCount), maxBackoff);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
    // Retry operation
  } else {
    throw new Error(`Provider API error: ${errorMessage}`);
  }
}
```

### Streaming Implementation

Use safe streaming implementation patterns:

```typescript
protected async *_streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  options: CompletionOptions,
): AsyncGenerator<ChatMessage> {
  try {
    // Setup request
    const response = await this.fetch(endpoint, {
      method: "POST",
      headers: { /* headers */ },
      body: JSON.stringify(requestBody),
      signal,
    });
    
    if (!response.ok) {
      // Handle error response
      throw new Error(`API error: ${response.status}`);
    }
    
    // Process streaming response
    const currentMessage = { role: "assistant", content: "" };
    
    // Use streamSse utility for consistent handling
    for await (const chunk of streamSse(response)) {
      // Process chunk and update current message
      const updatedMessage = processChunk(chunk, currentMessage);
      
      // Yield updated message when appropriate
      yield updatedMessage;
    }
  } catch (error: unknown) {
    // Handle error
    throw error;
  }
}
```

### Message Processing

Ensure proper message formatting and handling:

```typescript
// Convert standard messages to provider-specific format
function convertMessages(messages: ChatMessage[]): ProviderMessage[] {
  return messages.map(message => ({
    role: mapRole(message.role),
    content: processContent(message.content),
    // Other provider-specific fields
  }));
}

// Safely extract content as string
function processContent(content: MessageContent): string {
  return extractContentAsString(content);
}
```

### Configuration Management

Implement clean configuration handling:

```typescript
class ProviderConfig {
  static getApiKey(options: LLMOptions): string {
    return options.apiKey || process.env.PROVIDER_API_KEY || "";
  }
  
  static validateConfig(apiKey: string, apiBase?: string): void {
    if (!apiKey) {
      throw new Error("API key is required for Provider");
    }
    
    // Other validation logic
  }
}
```

## May 2025 Updates

Recent updates to provider implementations include:

1. **Enhanced Error Handling**: Improved error classification and recovery mechanisms
2. **Standardized Streaming Approach**: Unified approach to handling streaming responses
3. **Tool Argument Repair**: Centralized utility for repairing malformed JSON in tool arguments
4. **Type-Safe Module Interactions**: Better type definitions for cross-module communication
5. **Thinking Mode Support**: Enhanced support for Claude 3.7 Sonnet thinking mode
6. **Parameter Handling Improvements**: Better handling of unsupported parameters
7. **Documentation Updates**: Enhanced documentation with clear examples and best practices

Each provider implementation should follow these standards to ensure consistent behavior and maintainability across the codebase.

## Available LLM Providers

The Continue VS Code extension supports various LLM providers, including but not limited to:

- OpenAI (GPT models)
- Anthropic (Claude models)
- Mistral AI
- Databricks (hosting various models)
- Ollama (for local models)
- Azure OpenAI
- AWS Bedrock
- Groq
- Gemini (Google)
- Various others

Each provider has its own implementation file(s) in this directory, with proper handling for its specific API requirements and features.

## Special Integration: Databricks Claude 3.7 Sonnet

The Databricks implementation includes special support for Claude 3.7 Sonnet hosted on Databricks, with features like:

- Thinking mode integration with detailed step-by-step reasoning
- Robust handling of streaming responses and tool calls
- Parameter normalization for Databricks compatibility
- Comprehensive error handling and recovery

See the `Databricks/` directory for detailed implementation and documentation.
