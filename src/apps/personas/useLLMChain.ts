import * as React from 'react';

import { DLLMId } from '~/modules/llms/llm.types';
import { callChatGenerate } from '~/modules/llms/llm.client';
import { useModelsStore } from '~/modules/llms/store-llms';


export interface LLMChainStep {
  name: string;
  type: 'system_input_assistant-1',
  systemPrompt: string;
}


/**
 * React hook to manage a chain of LLM transformations.
 */
export function useLLMChain(steps: LLMChainStep[], llmId?: DLLMId, input?: string) {
  const [chain, setChain] = React.useState<ChainState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abortController = React.useRef(new AbortController());


  // start/stop the chain on input changes
  React.useEffect(() => {
    if (input) {
      if (llmId) {
        setError(null);
        setChain(initChainState(llmId, input, steps.map((step) => step.systemPrompt)));
      } else {
        setError('LLM not provided');
      }
    } else {
      setChain(null);
      abortController.current.abort(); // cancel any ongoing transformation
      abortController.current = new AbortController(); // create a new abort controller for the next transformation
    }
  }, [input, llmId, steps]);


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
    if (!chainStep.input) {
      console.log('WARNING - Input not clear - why is this happening?', chainStep);
      return;
    }

    // carve the middle part of the input if it's too long
    let inputText = chainStep.input;
    if (inputText.length > chain.safeInputLength) {
      const halfSafe = Math.floor(chain.safeInputLength / 2);
      inputText = `${inputText.substring(0, halfSafe)}\n...\n${inputText.substring(inputText.length - halfSafe)}`;
    }

    // perform the LLM transformation
    callChatGenerate(llmId, [
        { role: 'system', content: chainStep.systemPrompt },
        { role: 'user', content: inputText },
      ], chain.overrideResponseTokens,
    )
      .then(({ content }) => {
        // TODO: figure out how to handle the abort signal
        setChain(updateChainState(chain, stepIdx, content));
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
    chainProgress: chain?.progress ?? 0,
    chainOutput: chain?.output ?? null,
    chainError: error,
  };
}


interface ChainState {
  steps: StepState[];
  progress: number;
  safeInputLength: number;
  overrideResponseTokens: number;
  input: string;
  output: string | null;
}

interface StepState {
  idx: number;
  systemPrompt: string;
  input?: string;
  output?: string;
  isComplete: boolean;
  isLast: boolean;
}

function initChainState(llmId: DLLMId, input: string, systemPrompts: string[]): ChainState {
  // max token allocation fo the job
  const { llms } = useModelsStore.getState();
  const llm = llms.find(llm => llm.id === llmId);
  if (!llm)
    throw new Error(`LLM ${llmId} not found`);

  const maxTokens = llm.contextTokens;
  const overrideResponseTokens = Math.floor(maxTokens * 1 / 3);
  const inputTokens = maxTokens - overrideResponseTokens;
  const safeInputLength = Math.floor(inputTokens * 3); // it's deemed around 4

  return {
    steps: systemPrompts.map((systemPrompt, i) => ({
      idx: i,
      systemPrompt,
      input: !i ? input : undefined,
      output: undefined,
      isComplete: false,
      isLast: i === systemPrompts.length - 1,
    })),
    overrideResponseTokens,
    safeInputLength,
    progress: 0,
    input: input,
    output: null,
  };
}

function updateChainState(chain: ChainState, stepIdx: number, output: string): ChainState {
  const steps = chain.steps.length;
  return {
    ...chain,
    steps: chain.steps.map((step, i) =>
      (i === stepIdx) ? {
          ...step,
          output: output,
          isComplete: true,
        }
        : (i === stepIdx + 1) ? {
          ...step,
          input: output,
        } : step),
    progress: Math.round(100 * (stepIdx + 1) / steps) / 100,
    output: (stepIdx === steps - 1) ? output : null,
  };
}