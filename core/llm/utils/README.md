# Continue VS Code Extension - LLM Utility Modules

This directory contains utility modules that support the LLM integration functionality in the Continue VS Code extension. These utility files provide essential helper functions and tools for error handling, message processing, streaming, and JSON operations that are used throughout the LLM components.

## Directory Structure

```
core/llm/utils/
├── errors.ts       (エラー処理)
├── json.ts         (JSON処理)
├── messageUtils.ts (メッセージ処理)
├── sseProcessing.ts (SSE処理)
└── streamProcessing.ts (ストリーム処理)
```

## Core Utility Files

### `errors.ts`
Error handling utilities that:
- Define custom error types for LLM-related operations
- Provide standardized error handling patterns
- Help classify and respond to various error conditions from LLM providers

### `json.ts`
JSON processing utilities that:
- Offer safe methods for parsing and stringifying JSON
- Handle edge cases and malformed JSON data
- Provide type-safe JSON operations for LLM responses

### `messageUtils.ts`
Message processing utilities that:
- Convert between different message formats required by various LLM providers
- Extract and transform content from complex message structures
- Provide helpers for working with chat message histories
- Extract query contexts and relevant information from conversation history

### `sseProcessing.ts`
Server-Sent Events (SSE) processing utilities that:
- Parse and process SSE streams from LLM providers
- Handle event boundaries and formatting
- Provide mechanisms for working with streaming LLM responses

### `streamProcessing.ts`
Stream processing utilities that:
- Process streamed responses from LLM API calls
- Transform chunk-based responses into usable formats
- Manage stream state and error handling
- Provide utilities for combining and consuming streamed content

## Usage

These utility modules are designed to be imported and used throughout the LLM implementation codebase:

```typescript
import { safeStringify } from "../../utils/json.js";
import { extractContentAsString } from "../../utils/messageUtils.js";

// Example usage
const sanitizedContent = extractContentAsString(message.content);
const jsonString = safeStringify(complexObject, defaultValue);
```

The utility functions are modular and focused on specific tasks, making them reusable across different LLM provider implementations and ensuring consistent behavior throughout the codebase.
