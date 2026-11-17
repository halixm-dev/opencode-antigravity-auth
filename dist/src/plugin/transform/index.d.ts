/**
 * Transform Module Index
 *
 * Re-exports transform functions and types for request transformation.
 */
export type { ModelFamily, ThinkingTier, TransformContext, TransformResult, TransformDebugInfo, RequestPayload, ThinkingConfig, ResolvedModel, GoogleSearchConfig, } from "./types.js";
export { resolveModelWithTier, resolveModelWithVariant, resolveModelForHeaderStyle, getModelFamily, isTieredFlashModel, isGemini3_8FlashModel, MODEL_ALIASES, THINKING_TIER_BUDGETS, GEMINI_3_THINKING_LEVELS, } from "./model-resolver.js";
export type { VariantConfig } from "./model-resolver.js";
export { isClaudeModel, isClaudeThinkingModel, configureClaudeToolConfig, buildClaudeThinkingConfig, ensureClaudeMaxOutputTokens, appendClaudeThinkingHint, normalizeClaudeTools, applyClaudeTransforms, CLAUDE_THINKING_MAX_OUTPUT_TOKENS, CLAUDE_INTERLEAVED_THINKING_HINT, } from "./claude.js";
export type { ClaudeTransformOptions, ClaudeTransformResult } from "./claude.js";
export { isGeminiModel, isGemini3Model, isGemini25Model, isImageGenerationModel, buildGemini3ThinkingConfig, buildGemini25ThinkingConfig, buildImageGenerationConfig, normalizeGeminiTools, applyGeminiTransforms, } from "./gemini.js";
export type { GeminiTransformOptions, GeminiTransformResult, ImageConfig } from "./gemini.js";
export { sanitizeCrossModelPayload, sanitizeCrossModelPayloadInPlace, getModelFamily as getCrossModelFamily, stripGeminiThinkingMetadata, stripClaudeThinkingFields, } from "./cross-model-sanitizer.js";
export type { SanitizerOptions } from "./cross-model-sanitizer.js";
//# sourceMappingURL=index.d.ts.map