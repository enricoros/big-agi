import * as React from 'react';

import { DLLMId } from '~/modules/llms/llm.types';
import { callChatGenerate, VChatMessageIn } from '~/modules/llms/llm.client';
import { useModelsStore } from '~/modules/llms/store-llms';


export interface LLMChainStep {
  name: string;
  setSystem?: string;
  addPrevAssistant?: boolean;
  addUserInput?: boolean;
  addUser?: string;
}


/**
 * React hook to manage a chain of LLM transformations.
 */
export function useLLMChain(steps: LLMChainStep[], llmId?: DLLMId, chainInput?: string) {
  const [chain, setChain] = React.useState<ChainState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abortController = React.useRef(new AbortController());


  // start/stop when conditions change
  React.useEffect(() => {
    if (!chainInput) {
      setChain(null);
      abortController.current.abort(); // cancel any ongoing transformation
      abortController.current = new AbortController(); // create a new abort controller for the next transformation
      return;
    }
    setError(llmId ? null : 'LLM not provided');
    if (llmId)
      setChain(initChainState(llmId, chainInput, steps));
  }, [chainInput, llmId, steps]);


  // perform the next step
  React.useEffect(() => {
    if (!chain || !llmId) return;

    const stepIdx = chain.steps.findIndex((step) => !step.isComplete);
    if (stepIdx === -1) return;

    const chainStep = chain.steps[stepIdx];
    if (chainStep.output) {
      console.log('WARNING - Output not clear - why is this happening?', chainStep);
      return;
    }

    // execute the step
    let llmChatInput: VChatMessageIn[] = [...chain.chatHistory];
    const instruction = chainStep.ref;
    if (instruction.setSystem) {
      llmChatInput = llmChatInput.filter((msg) => msg.role !== 'system');
      llmChatInput.unshift({ role: 'system', content: instruction.setSystem });
    }
    if (instruction.addUserInput)
      llmChatInput.push({ role: 'user', content: implodeText(chain.input, chain.safeInputLength) });
    if (instruction.addPrevAssistant && stepIdx > 0)
      llmChatInput.push({ role: 'assistant', content: implodeText(chain.steps[stepIdx - 1].output!, chain.safeInputLength) });
    if (instruction.addUser)
      llmChatInput.push({ role: 'user', content: instruction.addUser });

    // perform the LLM transformation
    callChatGenerate(llmId, llmChatInput, chain.overrideResponseTokens)
      .then(({ content }) => {
        // TODO: figure out how to handle the abort signal
        setChain(updateChainState(chain, llmChatInput, stepIdx, content));
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.log('Transformation aborted');
        } else {
          console.error('callChatGenerate', err);
          setError(`Transformation Error: ${err?.message || err?.toString() || err || 'unknown'}`);
        }
      });

  }, [chain, llmId]);


  return {
    isFinished: !!chain?.output,
    isTransforming: !!chain?.steps?.length && !chain?.output,
    chainOutput: chain?.output ?? null,
    chainProgress: chain?.progress ?? 0,
    chainStepName: chain?.steps?.find((step) => !step.isComplete)?.ref.name ?? null,
    chainIntermediates: chain?.steps?.map((step) => step.output ?? null)?.filter(out => out) ?? [],
    chainError: error,
  };
}


interface ChainState {
  steps: StepState[];
  chatHistory: VChatMessageIn[];
  progress: number;
  safeInputLength: number;
  overrideResponseTokens: number;
  input: string;
  output: string | null;
}

interface StepState {
  ref: LLMChainStep;
  output?: string;
  isComplete: boolean;
  isLast: boolean;
}

function initChainState(llmId: DLLMId, input: string, steps: LLMChainStep[]): ChainState {
  // max token allocation fo the job
  const { llms } = useModelsStore.getState();
  const llm = llms.find(llm => llm.id === llmId);
  if (!llm)
    throw new Error(`LLM ${llmId} not found`);

  const maxTokens = llm.contextTokens;
  const overrideResponseTokens = Math.floor(maxTokens * 1 / 3);
  const inputTokens = maxTokens - overrideResponseTokens;
  const safeInputLength = Math.floor(inputTokens * 2); // it's deemed around 4

  return {
    steps: steps.map((step, i) => ({
      ref: step,
      output: undefined,
      isComplete: false,
      isLast: i === steps.length - 1,
    })),
    chatHistory: [],
    overrideResponseTokens,
    safeInputLength,
    progress: 0,
    input: input,
    output: null,
  };
}

function updateChainState(chain: ChainState, history: VChatMessageIn[], stepIdx: number, output: string): ChainState {
  const steps = chain.steps.length;
  return {
    ...chain,
    steps: chain.steps.map((step, i) =>
      (i === stepIdx) ? {
        ...step,
        output: output,
        isComplete: true,
      } : step),
    chatHistory: history,
    progress: Math.round(100 * (stepIdx + 1) / steps) / 100,
    output: (stepIdx === steps - 1) ? output : null,
  };
}

function implodeText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const halfLength = Math.floor(maxLength / 2);
  return `${text.substring(0, halfLength)}\n...\n${text.substring(text.length - halfLength)}`;
}