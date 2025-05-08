# Continue VS Code Extension - LLM Integration Modules

This directory contains the implementation of various Large Language Model (LLM) providers that can be used with the Continue VS Code extension. The modules in this directory enable the extension to interact with a wide range of LLM services and local model implementations.

## Directory Structure

```
core/llm/llms/
├── provider implementations (Anthropic.ts, OpenAI.ts, etc.)
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
