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

### The Orchestrator Pattern

For complex LLM providers, the framework recommends using the orchestrator pattern to achieve clear responsibility separation. This approach has been particularly well-implemented in the Databricks integration:

```typescript
// Main orchestrator class
class Databricks extends BaseLLM {
  // Initialization
  constructor(options: LLMOptions) {
    super(options);
    // Delegate configuration loading to specialized modules
    // Set up initial state and options
  }

  // Main API method that coordinates the entire process
  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: DatabricksCompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    // 1. Delegate configuration validation
    DatabricksConfig.validateApiConfig(this.apiKey, this.apiBase);
    
    // 2. Delegate message preprocessing
    const processedMessages = ToolCallProcessor.preprocessToolCallsAndResults(messages);
    
    // 3. Retry loop for handling transient errors
    while (retryCount <= MAX_RETRIES) {
      try {
        // 4. Process streaming request
        const result = await this.processStreamingRequest(
          processedMessages, signal, options, retryCount
        );
        
        // 5. Handle successful result
        if (result.success) {
          for (const message of result.messages) {
            yield message;
          }
          break;
        } else {
          // 6. Handle error with retry
          retryCount++;
          // 7. Delegate retry handling to error handler module
          await DatabricksErrorHandler.handleRetry(retryCount, result.error, result.state);
        }
      } catch (error) {
        // 8. Handle unexpected errors
        retryCount++;
        // 9. Delegate retry handling to error handler module
        await DatabricksErrorHandler.handleRetry(retryCount, error);
      }
    }
  }

  // Core processing method that coordinates specialized modules
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
      // 1. Delegate request parameter construction to helper module
      const args = DatabricksHelpers.convertArgs(options);
      
      // 2. Delegate message conversion to message module
      const formattedMessages = MessageProcessor.convertToOpenAIFormat(
        messages, MessageProcessor.sanitizeMessages(messages)
      );
      
      // 3. Delegate URL normalization to config module
      const apiBaseUrl = this.apiBase ? DatabricksConfig.normalizeApiUrl(this.apiBase) : "";
      
      // 4. Delegate timeout controller setup to config module
      const { timeoutController, timeoutId, combinedSignal } = 
        DatabricksConfig.setupTimeoutController(signal, options);

      // 5. Make API request
      const response = await this.fetch(apiBaseUrl, { /* configuration */ });

      // 6. Clean up resources
      clearTimeout(timeoutId);

      // 7. Check for error responses
      if (!response.ok) {
        // 8. Delegate error response parsing to error handler module
        const errorResponse = await DatabricksErrorHandler.parseErrorResponse(response);
        return { success: false, messages: [], error: errorResponse.error };
      }

      // 9. Handle non-streaming responses
      if (options.stream === false) {
        // 10. Delegate non-streaming response processing to helper module
        const message = await DatabricksHelpers.processNonStreamingResponse(response);
        return { success: true, messages: [message] };
      }

      // 11. Delegate streaming response processing to streaming module
      return await StreamingProcessor.processStreamingResponse(
        response, messages, retryCount, this.alwaysLogThinking
      );
    } catch (error) {
      // 12. Standardized error response
      return { 
        success: false, 
        messages: [], 
        error: error instanceof Error ? error : new Error(getErrorMessage(error)) 
      };
    }
  }
}
```

The orchestrator pattern has the following key components:

1. **Main Provider Class as Orchestrator**:
   - Acts as a coordinator between specialized modules
   - Delegates detailed implementation to appropriate modules
   - Maintains high-level flow control and error handling
   - Implements BaseLLM interface methods

2. **Specialized Modules with Clear Responsibilities**:
   - Configuration Management (`config.ts`): Handles API settings, validation, timeouts
   - Error Handling (`errors.ts`): Processes API errors, implements retry logic
   - Message Formatting (`messages.ts`): Converts between standard and provider-specific formats
   - Streaming (`streaming.ts`): Processes chunked responses and manages streaming state
   - Tool Calls (`toolcalls.ts`): Handles tool invocation and result processing
   - Helper Utilities (`helpers.ts`): Provides shared functionality for other modules
   - Type Definitions (`types/`): Defines interfaces and types specific to the provider

3. **Directory Structure for Orchestrator Pattern**:
   ```
   Provider/
   ├── Provider.ts          # Main orchestrator class
   ├── config.ts            # Configuration management
   ├── errors.ts            # Error handling and retry logic
   ├── helpers.ts           # Helper functions
   ├── messages.ts          # Message formatting and transformation
   ├── streaming.ts         # Streaming response processing
   ├── toolcalls.ts         # Tool call handling
   └── types/               # Provider-specific types
       ├── index.ts         # Type definition entry point
       ├── types.ts         # Main type definitions
       └── extension.d.ts   # Type extensions
   ```

### Benefits of the Orchestrator Pattern

1. **Clear responsibility separation**: Each module handles a specific aspect of the process
2. **Improved maintainability**: Changes to one aspect (e.g., error handling) can be made in one place
3. **Enhanced testability**: Modules can be tested independently
4. **Better code organization**: Code is organized by responsibility rather than being mixed together
5. **Reduced complexity**: Each method has a clear, focused purpose
6. **Easier onboarding**: New developers can understand the system more easily
7. **Code reuse**: Shared functionality can be used across modules
8. **Type safety**: Well-defined interfaces between modules ensure type safety
9. **Error recovery**: State preservation during errors is more structured
10. **Performance optimization**: Each module can be optimized independently

### Implementation Guidelines for the Orchestrator Pattern

1. **Start with a clear responsibility map**:
   - Identify distinct responsibilities in your provider
   - Group related responsibilities into modules
   - Define clean interfaces between modules

2. **Design the main orchestrator class**:
   - Focus on coordinating between modules, not implementation details
   - Keep methods at a consistent abstraction level
   - Handle top-level error management and retries

3. **Implement specialized modules**:
   - Each module should have a single clear purpose
   - Expose a well-defined interface with proper type definitions
   - Minimize dependencies between modules
   - Use common utilities when possible

4. **Define clear interfaces**:
   - Create explicit interface types for module APIs
   - Use clear parameter and return types
   - Document interface methods with JSDoc comments

5. **Manage state carefully**:
   - Define state objects with explicit interfaces
   - Use immutable update patterns for state changes
   - Preserve state during error recovery

### Modular Implementation Pattern

For simpler providers, a single file approach might be sufficient:

```typescript
class SimpleProvider extends BaseLLM {
  static providerName = "simple-provider";
  static defaultOptions = {
    // Default options
  };
  
  protected async _streamComplete(...) {
    // Implement streaming completion
  }
  
  protected async *_streamChat(...) {
    // Implement streaming chat
  }
}
```

This approach is suitable when:
- The provider has straightforward API requirements
- There's minimal need for specialized processing
- The implementation is relatively compact

### Common Utility Usage

All providers should utilize the common utility modules from `core/llm/utils/`:

1. Error handling utilities:
   ```typescript
   import { getErrorMessage, isConnectionError, isTransientError } from "../../utils/errors.js";
   
   try {
     // API call
   } catch (error: unknown) {
     const errorMessage = getErrorMessage(error);
     
     if (isTransientError(error)) {
       // Handle transient error with retry
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
   const processResult = processContentDelta(contentDelta, currentMessage);
   updatedMessage = processResult.updatedMessage;
   shouldYield = processResult.shouldYield;
   
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

### Message Content Type Handling

Handle message content types properly to avoid type errors:

```typescript
import { extractContentAsString } from "../../utils/messageUtils.js";

// When comparing message content or needing string format
function compareMessageContent(oldMessage: ChatMessage, newMessage: ChatMessage): boolean {
  // Safely extract content as string regardless of type
  const oldContent = extractContentAsString(oldMessage.content);
  const newContent = extractContentAsString(newMessage.content);
  
  return oldContent === newContent;
}

// When storing message content in a variable expecting string
function processMessage(message: ChatMessage): void {
  // Handles both string and MessagePart[] content types
  const contentAsString = extractContentAsString(message.content);
  
  // Now contentAsString is guaranteed to be a string
  if (contentAsString.includes("keyword")) {
    // Process the message
  }
}

// When updating lastYieldedMessageContent with message.content
// (This pattern fixes the common TypeScript error in streaming.ts)
lastYieldedMessageContent = extractContentAsString(currentMessage.content);
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

### Method Design for Streaming Processors

When implementing streaming processors, follow these guidelines:

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

### Common Type Compatibility Issues and Solutions

When working with TypeScript in LLM implementations, be aware of these common type issues:

1. **Message Content Type Incompatibility**:
   ```typescript
   // Problem: Type 'MessageContent' is not assignable to type 'string'
   lastYieldedMessageContent = currentMessage.content; // Error!
   
   // Solution: Use extractContentAsString
   import { extractContentAsString } from "../../utils/messageUtils.js";
   lastYieldedMessageContent = extractContentAsString(currentMessage.content);
   ```

2. **Array Index Type Safety**:
   ```typescript
   // Problem: Object is possibly 'null'
   const item = array[index]; // Error if index could be null
   
   // Solution: Use type guards and bounds checking
   if (index !== null && index >= 0 && index < array.length) {
     const item = array[index]; // Safe
   }
   ```

3. **JSON Parsing Type Safety**:
   ```typescript
   // Problem: Type 'any' for JSON.parse results
   const config = JSON.parse(jsonText); // Type is 'any'
   
   // Solution: Use safeJsonParse with generics
   import { safeJsonParse } from "../../utils/json.js";
   const config = safeJsonParse<ConfigType>(jsonText, defaultConfig);
   ```

4. **String Literal Escaping Issues**:
   ```typescript
   // Problem: Invalid escape sequence
   const pattern = /\"\w+\"\:/; // Error
   
   // Solution: Use consistent quote styles
   const pattern = /"\\w+\":/; // Using double quotes outside
   // or
   const pattern = /"\w+":/; // No need to escape quotes in regex
   ```

## 2025 May Updates

The framework has been enhanced with several improvements as of May 2025:

1. **Enhanced Message Content Type Handling**: Improved utilities for safely working with the `MessageContent` union type (string | MessagePart[]).

2. **Centralized Tool Arguments Repair**: Added comprehensive `repairToolArguments` utility to standardize handling of malformed JSON in tool arguments.

3. **JSON Delta Processing Standardization**: Implemented a unified approach for handling incremental JSON updates in streaming contexts.

4. **Claude 3.7 Sonnet Thinking Mode Support**: Added full support for Claude 3.7's thinking mode capability, with proper type definitions and processing logic.

5. **API URL Management Improvements**: Enhanced URL normalization and validation to ensure correct endpoint targeting.

6. **Error Handling Enhancements**: Improved type-safe error handling patterns for unknown error types.

7. **Boolean Value Repair in JSON**: Added specialized functions to fix common boolean value corruption issues in streaming contexts.

8. **Type-Safe State Management**: Further improvements to state tracking and preservation during errors and retries.

By following these patterns and best practices, you'll create more maintainable, robust LLM provider implementations that leverage the full power of TypeScript's type system and the common utilities provided by the framework.

## Usage

The LLM implementations are designed to be instantiated through the factory functions in `index.ts`:

```typescript
import { llmFromDescription } from 'core/llm/llms';

// Create an LLM instance based on a configuration description
const llm = await llmFromDescription(
  {
    provider: 'databricks',
    model: 'claude-3-7-sonnet-latest',
    // other options...
  },
  readFile,
  uniqueId,
  ideSettings,
  logger
);
```

Each LLM provider implements a common interface, making them interchangeable in the Continue extension's codebase.
