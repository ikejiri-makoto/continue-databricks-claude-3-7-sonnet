# Continue VS Code Extension - LLM Integration Modules

This directory contains the implementation of various Large Language Model (LLM) providers that can be used with the Continue VS Code extension. The modules in this directory enable the extension to interact with a wide range of LLM services and local model implementations.

## Directory Structure

```
core/llm/llms/
├── provider implementations (Anthropic.ts, OpenAI.ts, etc.)
├── provider-specific modules (provider-name/ directories)
├── utility files (index.ts, llm.ts, etc.)
└── type definition files (gemini-types.ts)
```

## Core Files

### `index.ts`
The main entry point for LLM integration. This file:
- Imports and exports all LLM provider implementations
- Provides factory functions to create LLM instances from configuration
- Maintains a registry of available LLM classes

### `llm.ts`
Defines the `LLMReranker` class, which is responsible for:
- Using LLMs to score and rerank search results
- Evaluating the relevance of code snippets to a particular query

## Provider Implementations

The directory contains implementations for various LLM providers:

### Cloud-based Commercial LLM Providers

| File | Provider | Description |
|------|----------|-------------|
| `Anthropic.ts` | Anthropic | Integration with Claude models (Claude 3, etc.) |
| `OpenAI.ts` | OpenAI | Integration with GPT models |
| `Azure.ts` | Microsoft Azure | Integration with Azure OpenAI Service |
| `Gemini.ts` | Google | Integration with Google's Gemini models |
| `Cohere.ts` | Cohere | Integration with Cohere's language models |
| `Mistral.ts` | Mistral AI | Integration with Mistral AI's models |
| `Together.ts` | Together AI | Integration with Together AI's platform |
| `Groq.ts` | Groq | Integration with Groq's fast inference platform |
| `Bedrock.ts` | AWS Bedrock | Integration with Amazon's Bedrock AI service |
| `xAI.ts` | xAI | Integration with xAI models |
| `VertexAI.ts` | Google Cloud | Integration with Google Cloud's Vertex AI |
| `WatsonX.ts` | IBM | Integration with IBM's WatsonX models |
| `SageMaker.ts` | AWS SageMaker | Integration with Amazon's SageMaker service |
| `Moonshot.ts` | Moonshot AI | Integration with Moonshot AI models |
| `Deepseek.ts` | Deepseek | Integration with Deepseek models |
| `DeepInfra.ts` | DeepInfra | Integration with DeepInfra's hosted models |
| `Fireworks.ts` | Fireworks AI | Integration with Fireworks AI platform |
| `Voyage.ts` | Voyage AI | Integration with Voyage AI models |
| `Cloudflare.ts` | Cloudflare | Integration with Cloudflare's AI services |
| `Cerebras.ts` | Cerebras | Integration with Cerebras AI models |
| `Asksage.ts` | AskSage | Integration with AskSage AI platform |
| `Nebius.ts` | Nebius | Integration with Nebius AI models |
| `OVHcloud.ts` | OVH Cloud | Integration with OVH Cloud AI services |
| `Novita.ts` | Novita AI | Integration with Novita AI models |
| `Relace.ts` | Relace | Integration with Relace AI platform |
| `Inception.ts` | Inception AI | Integration with Inception AI models |
| `SiliconFlow.ts` | Silicon Flow | Integration with Silicon Flow AI services |
| `Scaleway.ts` | Scaleway | Integration with Scaleway AI platform |
| `Venice.ts` | Venice | Integration with Venice AI models |
| `SambaNova.ts` | SambaNova | Integration with SambaNova AI platform |
| `Msty.ts` | MSTY | Integration with MSTY AI models |
| `Kindo.ts` | Kindo | Integration with Kindo AI services |
| `NCompass.ts` | NCompass | Integration with NCompass AI platform |
| `OpenRouter.ts` | OpenRouter | Service that routes to various LLM providers |
| `Databricks.ts` | Databricks | Integration with Databricks-hosted models (Claude, etc.) |

### Self-hosted/Local Model Implementations

| File | Provider | Description |
|------|----------|-------------|
| `Ollama.ts` | Ollama | Integration with locally run Ollama models |
| `LlamaCpp.ts` | Llama.cpp | Integration with locally run Llama.cpp models |
| `Llamafile.ts` | Llamafile | Integration with self-contained Llamafile executables |
| `Vllm.ts` | vLLM | Integration with vLLM inference server |
| `LMStudio.ts` | LM Studio | Integration with LM Studio's local models |
| `TextGenWebUI.ts` | Text Gen WebUI | Integration with Text Generation Web UI (Oobabooga) |
| `Docker.ts` | Docker | Running models in Docker containers |
| `HuggingFaceTGI.ts` | HuggingFace TGI | Integration with Text Generation Inference |
| `HuggingFaceTEI.ts` | HuggingFace TEI | Integration with Text Embeddings Inference |
| `HuggingFaceInferenceAPI.ts` | HuggingFace API | Integration with HuggingFace's Inference API |

### Special Providers and Utilities

| File | Provider | Description |
|------|----------|-------------|
| `FreeTrial.ts` | Free Trial | Provides access to trial/demo models |
| `FunctionNetwork.ts` | Function Network | Framework for chaining function calls between models |
| `CustomLLM.ts` | Custom LLM | Base class for implementing custom LLM providers |
| `BedrockImport.ts` | Bedrock Import | Helper for AWS Bedrock service integration |
| `Flowise.ts` | Flowise | Integration with Flowise AI platform |
| `Replicate.ts` | Replicate | Integration with Replicate model hosting |
| `Nvidia.ts` | NVIDIA | Integration with NVIDIA AI models |
| `Mock.ts` | Mock LLM | Mock implementation for testing |
| `Test.ts` | Test LLM | LLM implementation for automated tests |

### Type Definitions and Support Files

| File | Description |
|------|-------------|
| `gemini-types.ts` | Type definitions for Google Gemini API |
| `TransformersJsEmbeddingsProvider.ts` | Provider for embeddings using Transformers.js |
| `TransformersJsWorkerThread.js` | Worker thread for Transformers.js operations |
| `stubs/` | Stub implementations for various scenarios |

## Common Patterns and Best Practices

### Modular Implementation Pattern

For more complex LLM providers, follow the modular pattern of implementation:

1. Create a main provider class that extends `BaseLLM` and acts as an orchestrator:
   ```typescript
   class ComplexProvider extends BaseLLM {
     static providerName = "complex-provider";
     static defaultOptions = {
       // Default options
     };
     
     // Main methods that delegate to specialized modules
     protected async _streamComplete(...) {
       // Coordinate between specialized modules
     }
     
     protected async *_streamChat(...) {
       // Delegate responsibilities to specialized modules
     }
   }
   ```

2. Create a provider-specific directory with specialized modules:
   ```
   Provider/
   ├── config.ts       (Configuration management)
   ├── errors.ts       (Error handling and retry logic)
   ├── helpers.ts      (Common utility functions)
   ├── messages.ts     (Message formatting and transformation)
   ├── streaming.ts    (Streaming response processing)
   ├── toolcalls.ts    (Tool call handling)
   └── types/          (Type definitions)
   ```

3. Follow single responsibility principle for each module:
   - Each module should have a clear, focused responsibility
   - Prefer small, specialized functions over large multi-purpose ones
   - Use clear interfaces between modules

4. Use dependency injection pattern for configuration and utilities:
   ```typescript
   // ConfigManager handles all configuration logic
   class ConfigManager {
     static loadConfig() { /* ... */ }
     static validateConfig(config) { /* ... */ }
   }
   
   // ErrorHandler manages all error processing
   class ErrorHandler {
     static parseErrorResponse(response) { /* ... */ }
     static handleRetry(error, retryCount) { /* ... */ }
   }
   ```

### The Orchestrator Pattern (Example: Databricks)

The Databricks implementation provides an excellent example of the orchestrator pattern:

```typescript
// Databricks.ts - Main orchestrator class
class Databricks extends BaseLLM {
  // Configuration and initialization
  constructor(options: LLMOptions) {
    super(options);
    
    // Delegating configuration loading to the config module
    if (!this.apiBase) {
      this.apiBase = DatabricksConfig.getApiBaseFromConfig();
    }
    if (!this.apiKey) {
      this.apiKey = DatabricksConfig.getApiKeyFromConfig();
    }
    
    // Additional configuration
    this.alwaysLogThinking = (options as any).thinkingProcess !== false;
  }

  // Main entry point for streaming chat - coordinates the entire process
  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: DatabricksCompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    // Delegating configuration validation
    DatabricksConfig.validateApiConfig(this.apiKey, this.apiBase);
    
    // Delegating message preprocessing
    const processedMessages = ToolCallProcessor.preprocessToolCallsAndResults(messages);
    
    // Retry loop for handling transient errors
    let retryCount = 0;
    while (retryCount <= MAX_RETRIES) {
      try {
        // Process the streaming request (core functionality)
        const result = await this.processStreamingRequest(
          processedMessages, signal, options, retryCount
        );
        
        // Handle successful result
        if (result.success) {
          for (const message of result.messages) {
            yield message;
          }
          break;
        } else {
          // Handle error result with retry
          retryCount++;
          const errorToPass = result.error || new Error("Unknown error");
          
          // Delegating retry handling to error handler module
          await DatabricksErrorHandler.handleRetry(retryCount, errorToPass, result.state);
        }
      } catch (error) {
        // Handle unexpected errors
        retryCount++;
        
        // Delegating retry handling to error handler module
        await DatabricksErrorHandler.handleRetry(retryCount, error);
      }
    }
  }

  // Main processing method that coordinates all specialized modules
  private async processStreamingRequest(
    messages: ChatMessage[], 
    signal: AbortSignal, 
    options: DatabricksCompletionOptions,
    retryCount: number
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: Error;
    state?: any;
  }> {
    try {
      // Delegating request parameter construction to helper module
      const args = DatabricksHelpers.convertArgs(options);
      
      // Delegating message conversion to message module
      const formattedMessages = MessageProcessor.convertToOpenAIFormat(
        messages, MessageProcessor.sanitizeMessages(messages)
      );
      
      // Building request body
      const requestBody = {
        ...args,
        messages: formattedMessages,
      };

      // Delegating URL normalization to config module
      const apiBaseUrl = this.apiBase ? DatabricksConfig.normalizeApiUrl(this.apiBase) : "";
      
      // Delegating timeout controller setup to config module
      const { timeoutController, timeoutId, combinedSignal } = 
        DatabricksConfig.setupTimeoutController(signal, options);

      // Making API request
      const response = await this.fetch(apiBaseUrl, {
        // Request configuration
      });

      // Cleaning up timeout
      clearTimeout(timeoutId);

      // Handling error responses
      if (!response.ok) {
        // Delegating error response parsing to error handler module
        const errorResponse = await DatabricksErrorHandler.parseErrorResponse(response);
        return { success: false, messages: [], error: errorResponse.error };
      }

      // Handling non-streaming responses
      if (options.stream === false) {
        // Delegating non-streaming response processing to helper module
        const message = await DatabricksHelpers.processNonStreamingResponse(response);
        return { success: true, messages: [message] };
      }

      // Delegating streaming response processing to streaming module
      const streamResult = await StreamingProcessor.processStreamingResponse(
        response, messages, retryCount, this.alwaysLogThinking
      );
      
      // Returning streaming result
      return streamResult;
    } catch (error) {
      // Building standardized error result
      return { 
        success: false, 
        messages: [], 
        error: error instanceof Error ? error : new Error(getErrorMessage(error)) 
      };
    }
  }
}
```

This orchestrator pattern has several benefits:

1. **Clear responsibility separation**: Each module handles a specific aspect of the process
2. **Improved maintainability**: Changes to one aspect (e.g., error handling) can be made in one place
3. **Enhanced testability**: Modules can be tested independently
4. **Better code organization**: Code is organized by responsibility rather than being mixed together
5. **Reduced complexity**: Each method has a clear, focused purpose
6. **Easier onboarding**: New developers can understand the system more easily

### Common Utility Usage

Utilize the common utility modules from `core/llm/utils/`:

1. Error handling utilities:
   ```typescript
   import { getErrorMessage, isConnectionError } from "../../utils/errors.js";
   
   try {
     // API call
   } catch (error: unknown) {
     const errorMessage = getErrorMessage(error);
     
     if (isConnectionError(error)) {
       // Handle connection error with retry
     } else {
       // Handle other error types
     }
   }
   ```

2. JSON processing utilities:
   ```typescript
   import { safeStringify, safeJsonParse, extractValidJson, deepMergeJson } from "../../utils/json.js";
   
   // Safe JSON serialization
   const body = safeStringify(requestBody, "{}");
   
   // Type-safe JSON parsing with fallback
   const config = safeJsonParse<ConfigType>(jsonText, defaultConfig);
   
   // Extract valid JSON from mixed content
   const validJson = extractValidJson(mixedContent);
   if (validJson) {
     const data = safeJsonParse(validJson, defaultValue);
     // Process valid JSON
   }
   
   // Deep merge JSON objects
   const mergedConfig = deepMergeJson(defaultConfig, userConfig);
   ```

3. Stream processing utilities:
   ```typescript
   import { processContentDelta, JsonBufferHelpers } from "../../utils/streamProcessing.js";
   
   // Handle incremental content updates
   updatedContent = processContentDelta(currentContent, delta);
   
   // Buffer JSON fragments in streaming contexts
   let buffer = JsonBufferHelpers.resetBuffer();
   buffer = JsonBufferHelpers.addToBuffer(fragment, buffer, maxBufferSize);
   
   // Check if buffer contains complete JSON
   if (JsonBufferHelpers.isBufferComplete(buffer)) {
     const data = safeJsonParse(buffer, null);
     if (data !== null) {
       // Process complete JSON
       buffer = JsonBufferHelpers.resetBuffer();
     }
   }
   ```

4. Message processing utilities:
   ```typescript
   import { extractQueryContext, extractContentAsString } from "../../utils/messageUtils.js";
   
   // Extract query context from conversation
   const query = extractQueryContext(messages);
   
   // Safely extract content as string from various formats
   const textContent = extractContentAsString(content);
   ```

### Type Safety

Ensure robust type safety in implementation:

1. Use explicit type annotations:
   ```typescript
   function processToolCall(
     toolCall: ToolCall, 
     messages: ChatMessage[]
   ): ProcessedToolCall {
     // Implementation
   }
   ```

2. Create interface types for all complex structures:
   ```typescript
   interface StreamingResult {
     updatedMessage: ChatMessage;
     updatedToolCalls: ToolCall[];
     shouldYieldMessage: boolean;
     // Other properties
   }
   ```

3. Properly handle nullable values:
   ```typescript
   if (index !== null) {
     const safeIndex = Number(index);
     if (!Number.isNaN(safeIndex) && safeIndex >= 0 && safeIndex < array.length) {
       // Safe to access
       const item = array[safeIndex];
     }
   }
   ```

4. Use immutable update patterns:
   ```typescript
   // Instead of mutating objects directly
   const updated = {
     ...original,
     property: newValue
   };
   
   // Instead of mutating arrays directly
   const newArray = [...oldArray.slice(0, index), newItem, ...oldArray.slice(index + 1)];
   ```

5. Distinguish clearly between `undefined` and `null`:
   ```typescript
   const value: string | null = maybeUndefined !== undefined 
     ? maybeUndefined 
     : null;
   ```

### Method Design for Complex Processors

When implementing complex processing logic, follow these guidelines:

1. **Method Abstraction Levels**: Maintain consistent abstraction levels within a method
   ```typescript
   // GOOD: Consistent abstraction level
   processStream(response) {
     const data = this.parseResponse(response);
     const result = this.processData(data);
     return this.formatResult(result);
   }
   
   // BAD: Mixed abstraction levels
   processStream(response) {
     const text = await response.text();
     const lines = text.split('\n\n');
     const data = lines.map(line => JSON.parse(line.substring(5)));
     return this.formatResult(data);
   }
   ```

2. **Single Responsibility Methods**: Each method should have one clear purpose
   ```typescript
   // GOOD: Clear single responsibilities
   parseResponse(response) { /* ... */ }
   processData(data) { /* ... */ }
   formatResult(result) { /* ... */ }
   
   // BAD: Multiple responsibilities in one method
   processEverything(response) {
     // Parsing, processing, and formatting all in one method
   }
   ```

3. **State Management**: Use clear patterns for state updates
   ```typescript
   // GOOD: Immutable state updates
   processChunk(chunk, state) {
     return {
       ...state,
       message: this.updateMessage(state.message, chunk),
       shouldYield: this.shouldYieldMessage(chunk)
     };
   }
   
   // BAD: Direct state mutation
   processChunk(chunk, state) {
     state.message = this.updateMessage(state.message, chunk);
     state.shouldYield = this.shouldYieldMessage(chunk);
     return state;
   }
   ```

4. **Error Handling**: Handle errors at appropriate levels
   ```typescript
   // GOOD: Error handling at appropriate level
   async processStream(response) {
     try {
       for await (const chunk of this.streamChunks(response)) {
         yield this.processChunk(chunk);
       }
     } catch (error) {
       this.handleStreamError(error);
     }
   }
   
   // BAD: Too many nested try/catch blocks
   async processStream(response) {
     try {
       for await (const chunk of this.streamChunks(response)) {
         try {
           yield this.processChunk(chunk);
         } catch (chunkError) {
           this.handleChunkError(chunkError);
         }
       }
     } catch (streamError) {
       this.handleStreamError(streamError);
     }
   }
   ```

By following these patterns and best practices, you'll create more maintainable, robust LLM provider implementations that leverage the full power of TypeScript's type system and the common utilities provided by the framework.

## Usage

The LLM implementations are designed to be instantiated through the factory functions in `index.ts`:

```typescript
import { llmFromDescription } from 'core/llm/llms';

// Create an LLM instance based on a configuration description
const llm = await llmFromDescription(
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    // other options...
  },
  readFile,
  uniqueId,
  ideSettings,
  logger
);
```

Each LLM provider implements a common interface, making them interchangeable in the Continue extension's codebase.
