import { NextRequest, NextResponse } from 'next/server';
import { createParser as createEventsourceParser, EventSourceParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';

import { chatGenerateSchema, openAIAccess, openAIChatCompletionPayload } from '~/modules/llms/openai/openai.router';
import { OpenAI } from '~/modules/llms/openai/openai.types';


/**
 * Vendor stream parsers
 * - The vendor can decide to terminate the connection (close: true), transmitting anything in 'text' before doing so
 * - The vendor can also throw from this function, which will error and terminate the connection
 */
type AIStreamParser = (data: string) => { text: string, close: boolean };


// The peculiarity of our parser is the injection of a JSON structure at the beginning of the stream, to
// communicate parameters before the text starts flowing to the client.
function parseOpenAIStream(): AIStreamParser {
  let hasBegun = false;
  let hasWarned = false;

  return data => {

    const json: OpenAI.Wire.ChatCompletion.ResponseStreamingChunk = JSON.parse(data);

    // an upstream error will be handled gracefully and transmitted as text (throw to transmit as 'error')
    if (json.error)
      return { text: `[OpenAI Issue] ${json.error.message || json.error} (2)`, close: true };

    if (json.choices.length !== 1)
      throw new Error(`[OpenAI Issue] Expected 1 completion, got ${json.choices.length}`);

    const index = json.choices[0].index;
    if (index !== 0)
      throw new Error(`[OpenAI Issue] Expected completion index 0, got ${index}`);
    let text = json.choices[0].delta?.content /*|| json.choices[0]?.text*/ || '';

    // hack: prepend the model name to the first packet
    if (!hasBegun) {
      hasBegun = true;
      const firstPacket: OpenAI.API.Chat.StreamingFirstResponse = {
        model: json.model,
      };
      text = JSON.stringify(firstPacket) + text;
    }

    // if there's a warning, log it once
    if (json.warning && !hasWarned) {
      hasWarned = true;
      console.log('/api/llms/stream: OpenAI stream warning:', json.warning);
    }

    // workaround: LocalAI doesn't send the [DONE] event, but similarly to OpenAI, it sends a "finish_reason" delta update
    const close = !!json.choices[0].finish_reason;
    return { text, close };
  };
}


/**
 * Creates a TransformStream that parses events from an EventSource stream using a custom parser.
 * @returns {TransformStream<Uint8Array, string>} TransformStream parsing events.
 */
export function createEventStreamTransformer(vendorTextParser: AIStreamParser): TransformStream<Uint8Array, Uint8Array> {
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  let eventSourceParser: EventSourceParser;

  return new TransformStream({
    start: async (controller): Promise<void> => {
      eventSourceParser = createEventsourceParser(
        (event: ParsedEvent | ReconnectInterval) => {

          // ignore 'reconnect-interval' and events with no data
          if (event.type !== 'event' || !('data' in event))
            return;

          // event stream termination, close our transformed stream
          if (event.data === '[DONE]') {
            controller.terminate();
            return;
          }

          try {
            const { text, close } = vendorTextParser(event.data);
            if (text)
              controller.enqueue(textEncoder.encode(text));
            if (close)
              controller.terminate();
          } catch (error: any) {
            // console.log(`/api/llms/stream: parse issue: ${error?.message || error}`);
            controller.enqueue(textEncoder.encode(` - [AI ISSUE] ${error?.message || error}`));
            controller.terminate();
          }
        },
      );
    },

    // stream=true is set because the data is not guaranteed to be final and un-chunked
    transform: (chunk: Uint8Array) => {
      eventSourceParser.feed(textDecoder.decode(chunk, { stream: true }));
    },
  });
}

async function throwOpenAINotOkay(response: Response) {
  if (!response.ok) {
    let errorPayload: object | null = null;
    try {
      errorPayload = await response.json();
    } catch (e) {
      // ignore
    }
    throw new Error(`${response.status} · ${response.statusText}${errorPayload ? ' · ' + JSON.stringify(errorPayload) : ''}`);
  }
}

function createEmptyReadableStream(): ReadableStream {
  return new ReadableStream({
    start: (controller) => controller.close(),
  });
}


export default async function handler(req: NextRequest): Promise<Response> {

  // inputs - reuse the tRPC schema
  const { access, model, history } = chatGenerateSchema.parse(await req.json());

  // prepare the API request data
  const { headers, url } = openAIAccess(access, '/v1/chat/completions');
  const body = openAIChatCompletionPayload(model, history, null, 1, true);

  // begin event streaming from the OpenAI API
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(url, { headers, method: 'POST', body: JSON.stringify(body) });
    await throwOpenAINotOkay(upstreamResponse);
  } catch (error: any) {
    const fetchOrVendorError = (error?.message || typeof error === 'string' ? error : JSON.stringify(error)) + (error?.cause ? ' · ' + error.cause : '');
    console.log(`/api/llms/stream: fetch issue: ${fetchOrVendorError}`);
    throw new Error(`[OpenAI Issue] ${fetchOrVendorError} (1)`);
  }

  /* The following code is heavily inspired by the Vercel AI SDK, but simplified to our needs and in full control.
   * This replaces the former (custom) implementation that used to return a ReadableStream directly, and upon start,
   * it was blindly fetching the upstream response and piping it to the client.
   *
   * We now use backpressure, as explained on: https://sdk.vercel.ai/docs/concepts/backpressure-and-cancellation
   *
   * NOTE: we have not benchmarked to see if there is performance impact by using this approach - we do want to have
   * a 'healthy' level of inventory (i.e., pre-buffering) on the pipe to the client.
   */
  const chatResponseStream = (upstreamResponse.body || createEmptyReadableStream())
    .pipeThrough(createEventStreamTransformer(parseOpenAIStream()));

  return new NextResponse(chatResponseStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

// noinspection JSUnusedGlobalSymbols
export const runtime = 'edge';