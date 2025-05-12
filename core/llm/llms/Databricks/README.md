# Databricks LLM Integration for Continue

This directory contains the implementation for connecting Continue VS Code extension to Databricks LLM services, particularly Claude 3.7 Sonnet. It enables access to Databricks-hosted models for code completion, explanation, refactoring, and other features within the Continue extension.

## Databricks-Specific Limitations

### API Parameter Differences for Claude's Thinking Mode

**IMPORTANT**: Databricks endpoints require different API parameter placement for Claude's thinking mode compared to direct Anthropic API calls. The key differences are:

1. Databricks requires the `thinking` parameter to be placed inside the `extra_body` object, not at the top level
2. Model names need a `databricks-` prefix (e.g., `databricks-claude-3-7-sonnet` instead of `claude-3-7-sonnet-20240219`)
3. When disabling thinking mode, the `budget_tokens` parameter must be completely excluded (partial settings are not allowed)

Example comparison:
```typescript
// Anthropic direct API
const response = await anthropicClient.messages.create({
  model: "claude-3-7-sonnet-20240219",
  thinking: {
    type: "enabled",
    budget_tokens: 10240
  },
  // Other parameters
});

// Databricks API
const response = await client.chat.completions.create({
  model: "databricks-claude-3-7-sonnet",
  // IMPORTANT: thinking parameter inside extra_body object
  extra_body: {
    thinking: {
      type: "enabled",
      budget_tokens: 10240
    }
  },
  // Other parameters
});
```

These parameter structure differences have been handled in the implementation to ensure compatibility with Databricks endpoints.

### About the `parallel_tool_calls` Parameter

**IMPORTANT**: Databricks endpoints do not support the `parallel_tool_calls` parameter. This parameter is used by other providers (like OpenAI) to process tool calls in parallel, but Databricks endpoints do not recognize this parameter and it may cause errors.

The following measures have been implemented to address this issue:

1. **Exclusion at Type Definition Level**: Intentionally excluded this parameter from the `DatabricksCompletionOptions` and `DatabricksLLMOptions` interfaces to ensure type safety
2. **Parameter Setting Avoidance**: Modified `DatabricksHelpers.convertArgs()` to avoid setting this parameter
3. **Safe Access**: Modified to access tool information directly from properly typed `args` object instead of `requestBody` object
4. **Detailed Logging**: Added detailed logging for tool-related processing to facilitate debugging
5. **Error Detection and Handling**: Enhanced error handling to detect and handle special error patterns
6. **Safe Value Checking and Removal**: Added final validation before sending requests to automatically remove the `parallel_tool_calls` parameter if present
7. **Multiple Lines of Defense**: Multiple checkpoints through `convertArgs()` and request body construction

These measures improve compatibility with Databricks endpoints for tool calling functionality and prevent errors.

### Debugging and Logging Best Practices

**IMPORTANT**: To prevent issues with `[object Object]` appearing in the debug logs for the Databricks module, follow these best practices:

1. **Always Stringify Objects When Logging**:
   ```typescript
   // Bad - will show [object Object]
   console.log(`Tool info:`, tool);
   
   // Good - properties will be properly displayed
   import { safeStringify } from "../../utils/json.js";
   console.log(`Tool info:`, safeStringify(tool, "<invalid>"));
   ```

2. **Safe Access to Object Properties**:
   ```typescript
   // Bad - may error if property doesn't exist
   const toolName = tool.function.name;
   
   // Good - null-safe with optional chaining
   const toolName = tool?.function?.name || "<unnamed>";
   ```

3. **Exception Handling for Debug Logs**:
   ```typescript
   // Exception handling for debug logging
   try {
     // Tool name logging etc.
     const toolNames = args.tools
       .map((t: any) => t?.function?.name || 'unnamed')
       .join(', ');
     console.log(`Tool names: ${toolNames}`);
   } catch (e) {
     console.log(`Error while logging: ${getErrorMessage(e)}`);
   }
   ```

4. **Improved Request Body Logging**:
   ```typescript
   // Safe request body logging
   const truncatedBody = {
     model: requestBody.model,
     tools_count: requestBody.tools?.length || 0,
     messages_count: requestBody.messages?.length || 0
   };
   console.log('Request summary:', safeStringify(truncatedBody, "{}"));
   ```

5. **Detailed Logging in Development Mode**:
   ```typescript
   // Only output detailed logs in development mode
   if (process.env.NODE_ENV === 'development') {
     // Detailed information logging
   }
   ```

These best practices prevent `[object Object]` issues in logs and ensure more useful information is being logged.

### Thinking Mode Processing

Claude 3.7 Sonnet's thinking mode can return data in multiple different formats. In streaming mode, this thinking data may be sent in various formats:

1. Directly sent as a `thinking` property
2. Sent in `choices[0].delta.content.summary.text` format (most common for Databricks endpoints)
3. Sent in `content.summary.text` format
4. Sent in `summary.text` format
5. Sent in `reasoning` object or string format (Databricks-specific alternative)

To handle these different formats, the `processThinkingChunk` method uses a hierarchical processing approach with clear prioritization:

```typescript
private static processThinkingChunk(thinkingData: ThinkingChunk): ChatMessage {
  // Initialize variables for thinking content and signature
  let newThinking = "";
  let signature: string | undefined = undefined;
  
  try {
    // ***** HIGHEST PRIORITY: choices[0].delta.content.summary.text format *****
    if (thinkingData.choices && 
        Array.isArray(thinkingData.choices) && 
        thinkingData.choices.length > 0 && 
        thinkingData.choices[0]?.delta?.content?.summary?.text) {
      
      newThinking = thinkingData.choices[0].delta.content.summary.text;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Detected highest priority format (choices.delta.content.summary.text)');
      }
    }
    // ***** NEXT PRIORITY: choices[0].delta.content.summary format (object) *****
    else if (thinkingData.choices?.[0]?.delta?.content?.summary && 
           typeof thinkingData.choices[0].delta.content.summary === 'object') {
      const summaryObj = thinkingData.choices[0].delta.content.summary;
      if (summaryObj && typeof summaryObj === 'object' && summaryObj.text) {
        newThinking = summaryObj.text;
        // Debug log omitted for brevity
      } else {
        // Explore for text properties instead of string conversion
        const extractedText = this.findTextProperty(summaryObj);
        if (extractedText) {
          newThinking = extractedText;
          // Debug log omitted for brevity
        } else {
          newThinking = "[Thinking...]";
        }
      }
    }
    // ***** NEXT PRIORITY: content.summary.text format *****
    else if (thinkingData.content?.summary?.text) {
      newThinking = thinkingData.content.summary.text;
      // Debug log omitted for brevity
    }
    // ***** NEXT PRIORITY: summary.text format *****
    else if (thinkingData.summary?.text) {
      newThinking = thinkingData.summary.text;
      // Debug log omitted for brevity
    }
    // ***** NEXT PRIORITY: reasoning format (Databricks-specific) *****
    else if (typeof thinkingData === 'object' && 
             thinkingData !== null && 
             'reasoning' in thinkingData) {
      
      const reasoningData = thinkingData.reasoning;
      // Processing logic for reasoning format...
    }
    // ***** NEXT PRIORITY: thinking format (direct string or internal object) *****
    else if (thinkingData.thinking) {
      // Processing logic for thinking property format...
    }
    // ***** LAST RESORT: recursively search for text properties in the object *****
    else {
      const textProperties = this.findTextProperty(thinkingData);
      if (textProperties) {
        newThinking = textProperties;
        // Debug log omitted for brevity
      } else {
        // No text found anywhere in the object
        newThinking = "[Processing thinking content...]";
        
        // Debug mode only - log details of unprocessable data
        if (process.env.NODE_ENV === 'development') {
          console.log(`Unprocessable thinking data format: ${safeStringify(thinkingData, "<unknown format>")}`);
        }
      }
    }
    
    // Get signature information - process safely with type checking
    if (typeof thinkingData.signature === 'string') {
      signature = thinkingData.signature;
    } else if (thinkingData.choices?.[0]?.delta?.signature && 
                typeof thinkingData.choices[0].delta.signature === 'string') {
      signature = thinkingData.choices[0].delta.signature;
    }
    
  } catch (error) {
    // Handle error and continue processing
    console.error(`Error processing thinking chunk: ${getErrorMessage(error)}`);
    
    // Debug mode only - log detailed error information
    if (process.env.NODE_ENV === 'development') {
      console.error(`Chunk data: ${safeStringify(thinkingData, "<data error>")}`);
    }
    
    newThinking = `[Processing thinking data...]`;
  }
  
  // Create and return thinking message
  const thinkingMessage: ThinkingChatMessage = {
    role: "thinking",
    content: newThinking,
    signature: signature
  };
  
  // Log thinking process to console
  this.logThinkingProcess(thinkingMessage);
  
  return thinkingMessage;
}
```

### Enhanced Text Property Discovery

To find text content within complex nested objects, a recursive exploration function is implemented:

```typescript
private static findTextProperty(obj: any, depth: number = 0): string | null {
  // Prevent infinite loops or excessive recursion
  if (depth > 5) {
    return null;
  }
  
  // Handle null or undefined
  if (obj === null || obj === undefined) {
    return null;
  }
  
  // Return directly if a string
  if (typeof obj === 'string') {
    return obj;
  }
  
  // Recursively process for objects
  if (typeof obj === 'object') {
    // Prioritize Databricks-specific thinking mode formats
    
    // choices[0].delta.content.summary.text format (most common)
    if (obj.choices && 
        Array.isArray(obj.choices) && 
        obj.choices.length > 0 && 
        obj.choices[0]?.delta?.content?.summary?.text) {
      return obj.choices[0].delta.content.summary.text;
    }
    
    // Array format checking (more formats omitted for brevity)
    
    // Priority property names to check first
    const textPropertyNames = [
      'text', 'content', 'summary', 'thinking', 'reasoning',
      'message', 'description', 'value', 'delta', 'choices'
    ];
    
    // Check priority properties first
    for (const propName of textPropertyNames) {
      if (propName in obj) {
        const result = this.findTextProperty(obj[propName], depth + 1);
        if (result) {
          return result;
        }
      }
    }
    
    // Check all other properties if not found in priority props
    // Array handling logic omitted for brevity
  }
  
  return null;
}
```

### Solving the `[object Object]` Display Problem

The `[object Object]` display problem occurs due to the interaction between TypeScript's type system and JavaScript's object stringification. It's resolved using the following approaches:

1. **Flexible Type Definitions**: Enhanced `ThinkingChunk` interface to accommodate various data structures
2. **Type Guard Functions**: Added `isContentObject()` type guard for safe type checking
3. **Hierarchical Property Access**: Using optional chaining (`?.`) to safely extract text from all data formats
4. **Recursive Property Exploration**: Using `findTextProperty` method to explore for text in deeply nested objects
5. **Safe Stringification**: Using common utilities like `extractContentAsString` and `safeStringify` for safe stringification
6. **Appropriate Fallbacks**: Providing explicit fallback text when text can't be extracted via any method

Similar measures are applied when logging thinking processes:

```typescript
private static logThinkingProcess(thinkingMessage: ThinkingChatMessage): void {
  // Null check
  if (!thinkingMessage) {
    return;
  }
  
  try {
    // Use extractContentAsString to safely extract content
    const content = extractContentAsString(thinkingMessage.content) || "";
    
    // Add safe type checking
    if (content === undefined || content === null) {
      console.log('[Thinking Process] No data');
      return;
    }
    
    // Ensure text content is properly extracted
    let thinkingText = content;
    
    // If content is an object, attempt to extract text (avoid [object Object])
    if (typeof content === 'object') {
      // Process different format patterns
      // Processing logic omitted for brevity
      
      // Use safeStringify as a last resort
      thinkingText = safeStringify(content, "[Thinking...]");
    }
    
    // Truncate long thinking process for display
    const truncatedThinking = thinkingText.length > 200 
      ? thinkingText.substring(0, 200) + '...' 
      : thinkingText;
    
    // Log as simple text to prevent [object Object] display
    console.log('[Thinking Process]', truncatedThinking);
    
    // Additional signature logging omitted for brevity
  } catch (error) {
    // Skip logging errors to continue functionality
    // Error handling omitted for brevity
  }
}
```

For thinking mode to work correctly, appropriate parameters must be set in the request:

```typescript
// For direct Anthropic API
finalOptions.thinking = {
  type: "enabled",
  budget_tokens: thinkingBudgetTokens,
};

// For Databricks endpoint
finalOptions.extra_body = {
  thinking: {
    type: "enabled",
    budget_tokens: thinkingBudgetTokens,
  }
};
```

Note that thinking mode is only supported by Claude 3.7 Sonnet models.

## JSON Processing for Streaming Content

When working with streaming JSON data, the implementation uses various techniques to handle partial or malformed JSON. For Databricks endpoints with Claude 3.7 Sonnet's thinking mode, additional complexity arises due to nested JSON structure. These issues are addressed with:

1. **JSON Buffer Management**: Accumulating JSON fragments to reconstruct complete objects
2. **Delta-based JSON Processing**: Using `processJsonDelta` to incrementally build JSON objects
3. **JSON Validation and Repair**: Techniques for validating and repairing malformed JSON

```typescript
// Building an accumulatng buffer 
class JSONStreamParser {
  private buffer = '';
  
  // Process chunks and try to extract complete JSON objects
  processChunk(chunk: string): any[] {
    this.buffer += chunk;
    const results: any[] = [];
    
    // Look for multiple complete JSON objects
    let startIdx = 0;
    while (true) {
      try {
        const endIdx = this.findJsonEnd(this.buffer, startIdx);
        if (endIdx === -1) break;
        
        const jsonStr = this.buffer.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonStr);
        results.push(parsed);
        
        startIdx = endIdx + 1;
      } catch (e) {
        break; // Parsing error - wait for more data
      }
    }
    
    // Remove processed portions from buffer
    if (startIdx > 0) {
      this.buffer = this.buffer.substring(startIdx);
    }
    
    return results;
  }
  
  // Find end position of JSON object
  private findJsonEnd(str: string, startPos: number): number {
    // Implementation details for finding JSON object boundaries
    // ...
  }
}
```

## Module Relationships and Coordination

The Databricks integration consists of the main `Databricks.ts` class and multiple specialized modules in the `Databricks/` directory. This modularized design clearly separates responsibilities and maximizes the use of common utilities.

### Architecture Overview

The following diagram shows the relationships and dependencies between modules in the Databricks integration:

```
┌────────────────────────────────────────────────────────────────────┐
│                        Continue Core Framework                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │   BaseLLM   │ │ LLMOptions  │ │ChatMessage  │ │stream.js    │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
└────────────────────────────────────────────────────────────────────┘
               ▲                    ▲                  ▲
               │                    │                  │
               │                    │                  │
┌──────────────┼────────────────────┼──────────────────┼─────────────┐
│              │                    │                  │             │
│  ┌───────────┴────────────┐       │                  │             │
│  │     Databricks.ts      │◄──────┘                  │             │
│  │    (Orchestrator)      │◄─────────────────────────┘             │
│  └───────────┬────────────┘                                        │
│              │                                                     │
│              ▼                                                     │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                        Module Layer                       │      │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │      │
│  │ │  config.ts  │ │  errors.ts  │ │ helpers.ts  │          │      │
│  │ │Config Mgmt  │ │Error Handling│ │Helper Funcs │          │      │
│  │ └─────────────┘ └─────────────┘ └─────────────┘          │      │
│  │                                                           │      │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │      │
│  │ │ messages.ts │ │streaming.ts │ │ toolcalls.ts│          │      │
│  │ │Msg Conversion│ │Stream Process│ │Tool Calling │          │      │
│  │ └─────────────┘ └─────────────┘ └─────────────┘          │      │
│  └──────────────────────────────────────────────────────────┘      │
│                              ▲                                      │
│                              │                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                       Type Definition Layer               │      │
│  │ ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐ │      │
│  │ │    types.ts     │ │  extension.d.ts  │ │   index.ts    │ │      │
│  │ │                 │ │                  │ │               │ │      │
│  │ └─────────────────┘ └─────────────────┘ └───────────────┘ │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┼─────────────────────────────────────┐
│                             │                                     │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                  Common Utilities                         │     │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │     │
│  │ │  errors.js  │ │   json.js   │ │messageUtils │          │     │
│  │ │             │ │             │ │     .js      │          │     │
│  │ └─────────────┘ └─────────────┘ └─────────────┘          │     │
│  │                                                           │     │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │     │
│  │ │streamProcess│ │   sseProces │ │ toolUtils.js│          │     │
│  │ │    ing.js   │ │    sing.js  │ │             │          │     │
│  │ └─────────────┘ └─────────────┘ └─────────────┘          │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Module Structure Based on the Orchestrator Pattern

```
core/
├── index.js                   (Basic type definitions: ChatMessage, CompletionOptions, LLMOptions etc.)
├── util/
│   └── messageContent.js      (Chat message rendering functions)
└── llm/
    ├── index.js               (BaseLLM class - base class for all LLM implementations)
    ├── stream.js              (streamSse function - streaming response processing)
    ├── types/                 (Common type definition extensions - ensuring proper type safety)
    │   └── databricks-extensions.d.ts (Extension types for Databricks)
    ├── utils/                 (Common utility functions)
    │   ├── errors.js          (Error handling - provides getErrorMessage, isConnectionError)
    │   ├── json.js            (JSON processing - provides processJsonDelta and other functions)
    │   ├── messageUtils.js    (Message processing - provides extractContentAsString and other functions)
    │   └── toolUtils.js       (Tool processing - provides repairToolArguments and other functions)
    ├── llms/
    │   ├── Databricks.ts       (Orchestrator - integrates and coordinates all modules)
    │   └── Databricks/
    │       ├── config.ts       (Configuration management - handles API connection info and timeout settings)
    │       ├── errors.ts       (Error handling - dedicated error handling and retry logic)
    │       ├── helpers.ts      (Helper functions - request parameter construction and initialization)
    │       ├── messages.ts     (Message conversion - standardized message formatting)
    │       ├── streaming.ts    (Stream processing - handling streaming responses)
    │       ├── toolcalls.ts    (Tool call processing - handling tool invocations)
    │       └── types/          (Type definitions - interfaces and types)
    │           ├── index.ts        (Type definition entry point - exports all types)
    │           └── extension.d.ts  (Type extension definitions - extends core types with Databricks-specific requirements)
```

### Clear Module Responsibilities

**1. `Databricks.ts` - Orchestrator**
- Inherits BaseLLM, implements public API
- Coordinates specialized modules
- Routes requests
- High-level error handling
- Delegates responsibilities to appropriate modules
- Manages tool call control settings
- Coordinates communication between modules
- Controls overall flow and execution order
- Implements top-level APIs (_streamChat, _streamComplete)
- Manages streaming process lifecycle
- **New Feature**: `getApiEndpoint()` method for unified API request management

**2. `config.ts` - Configuration Management**
- Loads and validates API configuration
- Normalizes URLs
- Handles timeout settings
- Implements validation logic
- Reads configuration values from settings
- Centralizes environment settings
- Normalizes and validates API endpoints
- Sets up and manages timeout controllers
- **New Feature**: `getFullApiEndpoint()` method for complete API endpoint URL

**3. `errors.ts` - Error Handling**
- Databricks-specific error handling
- Parses error responses
- Implements retry logic
- Handles connection errors and timeouts
- Provides state-preserving retry mechanisms
- Detects transient errors and auto-recovery
- Type-safe error handling interfaces
- Provides generic retry utilities
- Configures and executes retry strategies
- Collects and analyzes error statistics

**4. `helpers.ts` - Helper Functions**
- Constructs request parameters
- Initializes streaming state
- Manages common constants and initial values
- Provides utility functions
- Converts to OpenAI-compatible format
- Processes non-streaming responses
- Validates JSON validity
- Processes content deltas
- Logs request bodies
- Detects text block completion
- **New Feature**: Claude 3.7 model auto-detection and dedicated configuration
- **Improvement**: Enhanced error logging and debugging
- **Update**: Type-safe content processing using common utilities
- **Addition**: Proper type definition and handling for `thinking` property
- **New Feature**: `processThinkingSummary()` method for thinking data extraction
- **New Feature**: `removeUnsupportedParameters()` for removing unnecessary parameters

**5. `messages.ts` - Message Conversion**
- Converts standard message formats
- Handles Claude 3.7 Sonnet-specific message processing
- Processes system and user messages
- Integrates thinking process messages
- Databricks-specific message preprocessing
- Handles composite content (text + images)
- Converts message formats (Continue → OpenAI format)
- Sanitizes and standardizes messages
- Detects and handles Japanese content
- Processes and validates empty messages
- **New Feature**: `processSystemMessage()` method for dedicated system message processing

**6. `streaming.ts` - Stream Processing**
- Processes streaming responses
- Handles thinking process streaming
- Accumulates JSON fragments
- Processes streaming tool calls
- Recovers from connection errors
- Uses common utilities for JSON delta-based processing
- Efficiently handles partial JSON
- Clearly separates responsibilities with modularized methods
- Implements clear state management and reconnection mechanisms
- Leverages common `processContentDelta` and `processJsonDelta` for consistent processing
- Properly handles message content types using `extractContentAsString` for type-safe handling
- Persists and restores state
- Handles reconnection
- Finalizes stream processing and cleanup
- **Improvement**: Proper handling of multiple thinking mode data formats
- **New Feature**: `findTextProperty()` for recursive text property exploration
- **New Feature**: Enhanced thinking data format detection
- **Update**: Hierarchical priority processing in `processThinkingChunk()` method
- **Fix**: Type-safe handling of object property access to prevent TypeScript errors

**7. `toolcalls.ts` - Tool Call Processing**
- Processes and standardizes tool calls
- Handles and repairs tool call arguments
- Integrates tool results
- Provides special handling for search tools
- Preprocesses messages after tool calls
- Uses common utilities for JSON delta-based tool argument processing
- Detects and repairs duplicated JSON patterns
- Pre- and post-processes tool calls and results
- Delta-processes and accumulates tool arguments
- Leverages common utility `repairToolArguments` for tool argument repair
- Implements interfaces for clear responsibility boundaries

**8. `types/` - Type Definitions**
- Defines strict type interfaces
- Supports type-safe code
- Extends common type definitions
- Enhances JSON processing-related type definitions
- Provides error handling-related type definitions
- Ensures type consistency and interoperability
- Standardizes type interfaces between modules
- Provides type assertions and guards
- Extends standard library types
- Supports type-safe error handling
- Provides module interface types for clear responsibility separation
- Defines explicit types for method declarations
- Enhances return type safety
- **Improvement**: Expanded and flexible `ThinkingChunk` interface
- **Addition**: Type definitions supporting multiple formats for thinking mode
- **Update**: Extended `ResponseDelta` to support object-format content

## Configuration

To use the Databricks integration, the following configuration is needed:

1. **API Base URL**: The connection URL to the Databricks endpoint
2. **API Key**: The Databricks API key for authentication

These can be configured in the `config.yaml` file:

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
    model: "databricks-claude-3-7-sonnet"
```

Important: The API base URL must always end with `/invocations`. You can verify if the URL is correctly configured by checking the console logs, which show the URL transformation process via `DatabricksConfig.normalizeApiUrl` and `DatabricksConfig.getFullApiEndpoint`.

## Claude 3.7 Sonnet Thinking Mode Configuration

Claude 3.7 Sonnet models support thinking mode, which provides more detailed step-by-step reasoning. To enable this mode, configure as follows:

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
    model: "databricks-claude-3-7-sonnet"
    completionOptions:
      thinking:
        type: "enabled"
        budget_tokens: 50000  # Optional: specify token budget (default is half of max_tokens)
```

Thinking mode is automatically detected and always enabled for Claude 3.7 models. When the model name includes "claude-3-7", the following special processing occurs:

1. **Thinking Mode Activation**: `thinking: { type: "enabled", budget_tokens: <budget> }` is added to the request
2. **Temperature Fixing**: The temperature parameter is fixed at 1.0 for optimal thinking mode performance
3. **Automatic Token Budget Calculation**: If not explicitly specified, half of `max_tokens` (up to 64000) is allocated as the token budget for the thinking process

This configuration allows Claude 3.7 Sonnet to display more detailed thinking processes and generate higher quality responses.

## Type-safe JSON Access and "choices" Property Error Solution

When working with Databricks endpoints, you may encounter the error: "Property 'choices' does not exist on type 'never'". This happens when TypeScript can't correctly understand the API response type. To solve this:

### 1. Type Guard + Validation for Safe LLM Response Processing

```typescript
// Define API response type
interface DatabricksClaudeResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    thinking?: string;
  }>;
}

// Type guard function
function isValidClaudeResponse(response: any): response is DatabricksClaudeResponse {
  return (
    response &&
    Array.isArray(response.choices) &&
    response.choices.length > 0
  );
}

// Safe access approach
async function getCompletionWithThinking() {
  const response = await fetchFromAPI();
  
  if (isValidClaudeResponse(response)) {
    // Type-safe access now possible
    const thinking = response.choices[0]?.thinking || '';
    const content = response.choices[0]?.message?.content || '';
    return { thinking, content };
  }
  
  throw new Error('Invalid API response');
}
```

### 2. Optional Chaining and Nullish Coalescing

```typescript
// Use optional chaining (?.) and nullish coalescing (??) for safe access
const thinking = response?.choices?.[0]?.thinking ?? '';
const content = response?.choices?.[0]?.message?.content ?? 'No response content';
```

### 3. Zod for Runtime Validation

For complex response structures, validation libraries like Zod are effective:

```typescript
import { z } from 'zod';

// Define Claude response schema
const ClaudeResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().optional()
      }).optional(),
      thinking: z.string().optional()
    })
  ).nonempty()
});

async function getValidatedCompletion() {
  const response = await api.fetchCompletion();
  
  // Validate and get strongly typed data
  const validated = ClaudeResponseSchema.parse(response);
  
  // Safe access - Zod guarantees structure
  return {
    thinking: validated.choices[0]?.thinking || '',
    content: validated.choices[0]?.message?.content || ''
  };
}
```

## Troubleshooting

### If parallel_tool_calls Errors Occur

If you see error messages like this in the error logs:

```
Property 'tools' does not exist on type '{ messages: any[]; system: string; }'
```

Check the following:

1. Whether you're using the latest code version (with May 2025 updates applied)
2. Whether `Databricks.ts` file is using `args.tools` instead of `requestBody.tools`
3. Whether `DatabricksHelpers.convertArgs()` method is not setting the `parallel_tool_calls` parameter

If these issues persist, enable detailed debug logging to identify the problem:

```typescript
// Enable debug logging (add to config.yaml)
debug: true
```

### If `[object Object]` is Displayed

If `[object Object]` appears in the console logs, proper object stringification is needed:

1. Use `safeStringify` function to log objects
2. Add checks for safe access to object properties
3. Add try-catch blocks around logging code

See the "Debugging and Logging Best Practices" section for details.

For thinking data processing issues, also check:

1. **Proper Thinking Data Format Detection**: Whether `StreamingProcessor.processChunk` method correctly detects thinking data
2. **Appropriate Thinking Data Extraction**: Whether `processThinkingChunk` method properly extracts text
3. **Thinking Data Format**: Check the actual thinking data format returned from the Databricks endpoint (check console logs)

### Type Definition Issues

If TypeScript compilation errors occur, check:

1. **Type Guards**: Ensure proper type guard functions are used to safely check object properties
2. **Optional Chaining**: Use optional chaining (`?.`) and nullish coalescing (`??`) operators for safe property access
3. **ContentObject Pattern**: Use the `isContentObject` type guard for safely checking object properties
4. **Content Extraction**: Use `extractContentAsString` to safely handle `MessageContent` type, which can be string or object

### Fixed TypeScript Errors with Type Guards

The TypeScript errors in `streaming.ts` have been resolved by implementing proper type guards and hierarchical property access:

```typescript
// Type guard for safely checking object properties
private static isContentObject(content: any): content is { summary?: { text?: string } } {
  return typeof content === 'object' && content !== null;
}

// Using type guard and in operator for safe property access
if (this.isContentObject(content) && (content.summary !== undefined || 'summary' in content)) {
  // Now TypeScript knows content is an object with a potentially defined summary property
  const thinkingData: ThinkingChunk = {
    content: {
      summary: content.summary
    }
  };
  
  // Safe access with properly typed objects
  thinkingData.choices = [{
    delta: {
      content: {
        summary: content.summary
      }
    }
  }];
  
  const thinkingMessage = this.processThinkingChunk(thinkingData);
  // ...
}
```

By using proper type guards and carefully structured conditional checks, we can ensure TypeScript correctly narrows types and prevents "Property does not exist on type 'never'" errors, which commonly happen when TypeScript loses track of an object's structure in complex conditionals.

## Future Improvement Plans

1. **Performance Optimization**: Further optimize request processing and response parsing performance
2. **Improved Buffer Management**: More efficient JSON buffer management for improved stability in large streaming
3. **Enhanced Context Management**: Improved context management considering token limits
4. **Increased Type Safety**: Stricter type definitions and checks for improved safety
5. **Improved Parallel Processing**: Optimized resource sharing between multiple requests
6. **Enhanced Error Handling**: More detailed error analysis and automatic recovery
7. **Documentation Improvements**: Enhanced user documentation and in-code comments
8. **Support for New Features**: Support for future Claude 3.7/3.8 features
9. **Performance Metrics Collection**: Detailed performance measurement and metrics collection for optimization
10. **Expanded Automated Testing**: More comprehensive automated testing for quality assurance

This modularized architecture significantly improves the extension's stability and maintainability, making it easier to adapt to future API changes. The May 2025 improvements have resolved URL routing issues, improved type safety and common utility usage. Most importantly, Claude 3.7 Sonnet's thinking mode is now correctly processed with robust support for various data formats and the [object Object] issue has been resolved.