# Continue VS Code Extension - LLM Core Framework

This directory contains the core framework for integrating Large Language Models (LLMs) into the Continue VS Code extension. It provides the foundation for all LLM interactions, handling everything from model communication to token counting, message formatting, and capability detection.

## Directory Structure

```
core/llm/
├── llms/                  # Provider-specific LLM implementations
├── rules/                 # Rules for validating and transforming LLM interactions
├── templates/             # Prompt templates for different model types
├── utils/                 # Utility functions for LLM operations
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

### Template System
Flexible prompt template system:
- Model-specific message formatting
- Handlebars-based template rendering
- Support for various prompt engineering techniques

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
