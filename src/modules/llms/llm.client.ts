import { DLLM, DLLMId } from './llm.types';
import { OpenAI } from './openai/openai.types';
import { findVendorById } from './vendor.registry';
import { useModelsStore } from './store-llms';


export type ModelVendorCallChatFn = (llm: DLLM, messages: VChatMessageIn[], maxTokens?: number) => Promise<VChatMessageOut>;
export type ModelVendorCallChatWithFunctionsFn = (llm: DLLM, messages: VChatMessageIn[], functions: VChatFunctionIn[], maxTokens?: number) => Promise<VChatMessageOrFunctionCallOut>;

export interface VChatMessageIn {
  role: 'assistant' | 'system' | 'user'; // | 'function';
  content: string;
  //name?: string; // when role: 'function'
}

export type VChatFunctionIn = OpenAI.Wire.ChatCompletion.RequestFunctionDef;

export interface VChatMessageOut {
  role: 'assistant' | 'system' | 'user';
  content: string;
  finish_reason: 'stop' | 'length' | null;
}

export interface VChatMessageOrFunctionCallOut extends VChatMessageOut {
  function_name: string;
  function_arguments: object | null;
}


export async function callChatGenerate(llmId: DLLMId, messages: VChatMessageIn[], maxTokens?: number): Promise<VChatMessageOut> {
  const { llm, vendor } = getLLMAndVendorOrThrow(llmId);
  return await vendor.callChat(llm, messages, maxTokens);
}

export async function callChatGenerateWithFunctions(llmId: DLLMId, messages: VChatMessageIn[], functions: VChatFunctionIn[], maxTokens?: number): Promise<VChatMessageOrFunctionCallOut> {
  const { llm, vendor } = getLLMAndVendorOrThrow(llmId);
  return await vendor.callChatWithFunctions(llm, messages, functions, maxTokens);
}


function getLLMAndVendorOrThrow(llmId: DLLMId) {
  const llm = useModelsStore.getState().llms.find(llm => llm.id === llmId);
  const vendor = findVendorById(llm?._source.vId);
  if (!llm || !vendor) throw new Error(`callChat: Vendor not found for LLM ${llmId}`);
  return { llm, vendor };
}