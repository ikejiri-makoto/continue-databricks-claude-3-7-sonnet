# Continue VS Code Extension - LLM Core Framework

This directory contains the core framework for integrating Large Language Models (LLMs) into the Continue VS Code extension. It provides the foundation for all LLM interactions, handling everything from model communication to token counting, message formatting, and capability detection.

## Directory Structure

```
core/llm/
├── llms/                  # Provider-specific LLM implementations
│   ├── provider.ts        # Single-file provider implementations
│   └── Provider/          # Modular provider implementations
├── rules/                 # Rules for validating and transforming LLM interactions
├── templates/             # Prompt templates for different model types
├── utils/                 # Utility functions for LLM operations
├── types/                 # Type definitions and extensions
├── autodetect.ts          # Capability and template detection for models
├── constants.ts           # Constant values used throughout the LLM system
├── countTokens.ts         # Functions for token counting across models
├── index.ts               # Main entry point and BaseLLM implementation
├── stream.ts              # Streaming utilities for LLM responses
├── toolSupport.ts         # Definitions for agent/tool support by provider
└── other supporting files
```

## Core Components

### `index.ts`
The heart of the LLM integration system, containing:
- `BaseLLM` abstract class that all LLM providers extend
- Core methods for chat, completion, and embedding operations
- Stream handling and error management
- Logging and telemetry integration

### `autodetect.ts`
Responsible for auto-detecting model capabilities:
- Determines which models support images, tools, and other features
- Maps models to appropriate prompt templates
- Identifies which providers can handle custom formatting

### `toolSupport.ts`
Defines which providers and models support agent functionality:
- `PROVIDER_TOOL_SUPPORT` mapping indicating which models can use tools
- Provider-specific detection functions for tool capabilities

### `stream.ts`
Utilities for handling streaming responses from LLMs:
- Implements Server-Sent Events (SSE) parsing
- Manages chunked responses from different API formats
- Ensures proper handling of tool calls in streaming mode

### `countTokens.ts`
Functions for token counting and context management:
- Implements token counting for different model families
- Handles message pruning to fit context windows
- Optimizes prompt construction to maximize token efficiency

## Key Features

### Agent and Tool Support
The framework includes robust support for agent functionality:
- Tool definition and execution through LLM APIs
- Streaming tool calls and responses
- Provider-specific adaptations for tool handling
- Tool argument validation and repair mechanisms
- Standardized tool result formatting across providers
- Anthropic-style JSON delta processing for more robust tool calls
- Control for parallel tool calls to prevent duplicated JSON issues

### Multi-Provider Architecture
Designed to work with a wide variety of LLM providers:
- Common interface across all providers
- Automatic capability detection
- Provider-specific optimizations

### Streaming Support
Comprehensive streaming implementation:
- Real-time token delivery for responsive UI
- Proper handling of structured data in streams
- Support for advanced features like "thinking" blocks
- Robust JSON fragment handling in streaming contexts
- Delta-based JSON processing for improved stability with partial JSON

### Template System
Flexible prompt template system:
- Model-specific message formatting
- Handlebars-based template rendering
- Support for various prompt engineering techniques

### Enhanced JSON Processing
Robust JSON processing utilities for handling streaming and partial content:
- Extraction of valid JSON from mixed content or fragments
- Safe parsing with type information and error handling
- Deep merging of JSON objects with proper structure preservation
- Buffer management for accumulating JSON fragments in streams
- Automatic repair of malformed JSON in tool arguments
- Delta-based JSON processing for Anthropic-style incremental JSON updates
- Pattern detection and repair for duplicated JSON structures

### Robust Error Handling
Comprehensive error handling system:
- Standardized error processing across the framework
- Common utilities for error detection and classification
- Retry mechanisms with exponential backoff
- State preservation during retries for streaming operations
- Connection error recovery with session resumption

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

## Usage Example

The typical flow for using the LLM framework:

```typescript
// Create an LLM instance based on configuration
const llm = await llmFromDescription({
  provider: "databricks",
  model: "databricks-claude-3-7-sonnet",
  // other options...
});

// Stream a chat completion
for await (const message of llm.streamChat(
  [{ role: "user", content: "Tell me about Continue" }],
  new AbortController().signal,
  { 
    // Enable agent functionality with tools
    tools: [
      {
        type: "function",
        function: {
          name: "search_docs",
          description: "Search the documentation",
          parameters: { /* OpenAPI schema */ }
        }
      }
    ]
  }
)) {
  // Process each message chunk
  console.log(message);
}
```

## Adding Custom Provider Support

To add a new LLM provider:
1. Create a new file in the `llms/` directory
2. Extend the `BaseLLM` class
3. Implement required methods (`_streamComplete`, `_streamChat`, etc.)
4. Add capability detection in `autodetect.ts`
5. Include tool support in `toolSupport.ts` if applicable

For complex providers, consider using the modular approach described above to maintain clear separation of concerns.

## Agent Functionality

Agent mode allows LLMs to use tools to accomplish tasks. To enable Agent support:

1. Include the provider in `PROVIDER_TOOL_SUPPORT` in `toolSupport.ts`
2. Implement proper tool handling in the provider's class
3. Support streaming tool calls in the `_streamChat` method
4. Add appropriate capabilities declaration:
   ```typescript
   static defaultOptions: Partial<LLMOptions> = {
     // ...
     capabilities: {
       tool_use: true
     }
   };
   ```

The framework automatically detects and enables Agent functionality for supported models like Claude 3.5/3.7, GPT-4, and others through the auto-detection system.

### Enhanced Agent Capabilities

The framework includes several features to enhance Agent functionality:

1. **Message Preprocessing**: Ensures tool calls and tool results are properly matched in conversations
2. **Tool Argument Repair**: Automatically detects and fixes malformed JSON in tool arguments
3. **Streaming Tool Calls**: Supports real-time streaming of tool calls and results
4. **Tool Result Standardization**: Normalizes tool results across different providers
5. **Error Recovery**: Maintains state during connection errors to resume tool operations
6. **File Operation Support**: Special handling for file operation tools like file creation and editing
7. **JSON Delta Processing**: Enhanced handling of partial JSON in streaming contexts using delta-based approaches
8. **Parallel Tool Call Control**: Options to control parallel tool call behavior to prevent duplicated JSON structures

## Best Practices

### JSON Processing in Streaming Contexts

When handling JSON in streaming contexts (especially with tool calls), use the enhanced JSON utilities:

```typescript
import { safeJsonParse, extractValidJson, processJsonDelta } from "../utils/json";
import { JsonBufferHelpers } from "../utils/streamProcessing";

// Extract valid JSON from potentially mixed content
const validJson = extractValidJson(mixedContent);
if (validJson) {
  const parsedData = safeJsonParse(validJson, defaultValue);
  // Process clean JSON data
}

// For accumulating JSON fragments in streaming contexts
let buffer = JsonBufferHelpers.resetBuffer();
buffer = JsonBufferHelpers.addToBuffer(fragment, buffer, maxBufferSize);

// Check if buffer contains valid JSON
if (JsonBufferHelpers.isBufferComplete(buffer)) {
  const data = safeJsonParse(buffer, null);
  if (data !== null) {
    // Process complete JSON data
    // Reset buffer
    buffer = JsonBufferHelpers.resetBuffer();
  }
}

// For delta-based JSON processing (Anthropic style)
const result = processJsonDelta(currentJson, deltaJson);
if (result.complete) {
  // Process complete JSON
  const data = safeJsonParse(result.combined, null);
  // Handle complete JSON object
} else {
  // Continue accumulating JSON fragments
}
```

### Error Handling and Retries

Implement consistent error handling with retry mechanisms for network issues:

```typescript
import { getErrorMessage, isConnectionError } from "../utils/errors";

try {
  // API call
} catch (error: unknown) {
  const errorMessage = getErrorMessage(error);
  
  if (isConnectionError(error)) {
    // Implement retry with exponential backoff
    const backoffTime = Math.min(initialBackoff * Math.pow(2, retryCount), maxBackoff);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
    // Retry operation
  } else {
    // Handle other error types
  }
}
```

### Type Safety

Ensure proper type safety, especially with nullable values and array access:

```typescript
// Safe array access with boundary check
if (index !== null) {
  const numericIndex = Number(index);
  if (!Number.isNaN(numericIndex) && numericIndex >= 0 && numericIndex < array.length) {
    // Safe to access array[numericIndex]
  }
}

// Clear distinction between undefined and null
const result = maybeUndefined !== undefined ? maybeUndefined : defaultValue;

// Immutable updates for constant objects
const newState = {
  ...oldState,
  updatedProperty: newValue
};
```

### Modular Design and Responsibility Separation

For complex providers, follow these principles:

1. **Single Responsibility Principle**: Each module should have one clearly defined responsibility
2. **Orchestration Pattern**: Main provider class coordinates between specialized modules
3. **Clear Interfaces**: Define clear interfaces between modules
4. **Shared State Management**: Use immutable state patterns for data shared between modules
5. **Common Utility Usage**: Leverage shared utilities rather than reimplementing functionality

By following these best practices, you can ensure more robust and maintainable code across the LLM framework.
