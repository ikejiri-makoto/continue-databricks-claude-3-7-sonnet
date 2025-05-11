// This file defines extensions to core types
// Required to support Databricks-specific features

// LLMOptions extension
import { LLMOptions, CompletionOptions } from "../index";

// Add Databricks-specific options
declare module "../index" {
  interface LLMOptions {
    /**
     * Whether to always log thinking process
     * If true, always log; if false, only log in development mode
     */
    thinkingProcess?: boolean;
    
    /**
     * Whether to allow parallel tool calls
     * If false, only process one tool call at a time
     * Based on OpenAI-style parallel control
     */
    parallelToolCalls?: boolean;
  }

  // Add extension for CompletionOptions
  interface CompletionOptions {
    /**
     * Thinking mode configuration for Claude 3.7 models
     * Enables and configures thinking process
     */
    thinking?: {
      /**
       * Thinking mode type - currently only "enabled" is supported
       */
      type: string;
      
      /**
       * Token budget for thinking process
       * Default is half of max_tokens (up to 64000)
       */
      budget_tokens?: number;
    };
  }

  // Add further type extensions as needed
}
