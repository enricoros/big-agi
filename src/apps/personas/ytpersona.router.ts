// noinspection ExceptionCaughtLocallyJS

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/modules/trpc/trpc.server';


const inputSchema = z.object({
  videoId: z.string().nonempty(),
});

const youtubeTranscriptionSchema = z.object({
  wireMagic: z.literal('pb3'),
  events: z.array(
    z.object({
      tStartMs: z.number(),
      dDurationMs: z.number().optional(),
      aAppend: z.number().optional(),
      segs: z.array(
        z.object({
          utf8: z.string(),
          tOffsetMs: z.number().optional(),
        }),
      ).optional(),
    }),
  ),
});


export const ytPersonaRouter = createTRPCRouter({

  /**
   * Get the transcript for a YouTube video ID
   */
  getTranscript: publicProcedure
    .input(inputSchema)
    .query(async ({ input }) => {
      const { videoId } = input;
      try {

        // 1. find the cpations URL within the video HTML page
        const data = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        const html = await data.text();
        const indexStart = html.indexOf('https://www.youtube.com/api/timedtext');
        const indexEnd = html.indexOf('"', indexStart);
        if (indexStart < 0 || indexEnd <= indexStart)
          throw new TRPCError({ code: 'BAD_REQUEST', message: '[YouTube API Issue] Could not find the default captions track' });
        const captionsUrlEnc = html.substring(indexStart, indexEnd);
        let captionsUrl = decodeURIComponent(captionsUrlEnc.replaceAll('\\u0026', '&'));

        // 2. fetch the captions
        // note: the desktop player appends this much: &fmt=json3&xorb=2&xobt=3&xovt=3&cbr=Chrome&cbrver=114.0.0.0&c=WEB&cver=2.20230628.07.00&cplayer=UNIPLAYER&cos=Windows&cosver=10.0&cplatform=DESKTOP
        const captionsData = await fetch(captionsUrl + `&fmt=json3`);
        const captions = await captionsData.json();
        const safeData = youtubeTranscriptionSchema.safeParse(captions);
        if (!safeData.success) {
          console.error(safeData.error);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '[YouTube API Issue] Could not parse the captions' });
        }

        // 3. flatten to text
        const transcript = safeData.data.events
          .flatMap(event => event.segs ?? [])
          .map(seg => seg.utf8)
          .join('');

        return {
          videoId,
          transcript,
        };

      } catch (error: any) {
        throw error instanceof TRPCError ? error
          : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `[YouTube Captions Issue] Error: ${error?.message || error?.toString() || 'unknown'}` });
      }
    }),

});


/*

"Analyze the provided YouTube transcript, identifying and interpreting key characteristics such as the speaker's professional background, personality traits, style of communication, and core motivations, while specifically focusing on their age, industry knowledge, and narrative context. From this analysis, create a succinct yet comprehensive 'You are a...' character sheet that encapsulates the persona's multifaceted traits. Be sure to infuse the sheet with vivid illustrations drawn from the transcript that bring the character to life, equipping an actor with enough actionable insights for an accurate, engaging portrayal of the persona. The ultimate objective is to transform the text analysis into a tangible character, capturing the essence and complexities of the persona in one complete character sheet."


1. Analysis: "Conduct a comprehensive study of the YouTube transcript. Pinpoint and document key attributes of the speaker, such as age, professional expertise, standout personality traits, unique style of communication, narrative context, and levels of self-awareness. Scrutinize tone, language use, industry knowledge depth, humour usage, and motivations. Your deliverable is a detailed written analysis that effectively chronicles all aspects of the speaker's persona."

2. Character Sheet Drafting: "Translate the completed written analysis into a draft 'You are a...' character sheet. Ensure your draft covers all notable characteristics of the persona, including personality traits, professional background, communication style, knowledge base, context, self-awareness, and motivational aspects. The deliverable at this stage is a comprehensive draft of the character sheet."

3. Validation and Refinement: "Perform a detailed comparison of your character sheet draft and the original transcript. Ensure the sheet captures the speaker's essence and aligns with the transcript content. Integrate distinctive examples from the transcript for tangible, actionable references and refine as necessary for clarity and authenticity. Your final product is a perfected 'You are a...' character sheet, serving as a definitive guide for an actor embodying the persona."


1. Analysis: Conduct comprehensive research on the provided transcript. Identify key characteristics of the speaker, including age, professional field, distinct personality traits, style of communication, narrative context, and self-awareness. Additionally, consider any unique aspects such as their use of humor, their cultural background, core values, passions, fears, personal history, and social interactions. Your output for this stage is an in-depth written analysis that exhibits an understanding of both the superficial and more profound aspects of the speaker's persona.

2. Character Sheet Drafting: Craft your documented analysis into a draft of the 'You are a...' character sheet. It should encapsulate all crucial personality dimensions, along with the motivations and aspirations of the persona. Keep in mind to balance succinctness and depth of detail for each dimension. The deliverable here is a comprehensive draft of the character sheet that captures the speaker's unique essence.

3. Validation and Refinement: Compare the draft character sheet with the original transcript, validating its content and ensuring it captures both the speaker’s overt characteristics and the subtler undertones. Fine-tune any areas that require clarity, have been overlooked, or require more authenticity. Use clear and illustrative examples from the transcript to refine your sheet and offer meaningful, tangible reference points. Your finalized deliverable is a coherent, comprehensive, and nuanced 'You are a...' character sheet that serves as a go-to guide for an actor recreating the persona.

 */