// noinspection ExceptionCaughtLocallyJS

import {NextRequest, NextResponse} from 'next/server';

import {PasteGG} from '@/modules/pastegg/pastegg.types';
import {PineconeClient} from "@pinecone-database/pinecone";
import {OpenAIEmbeddings} from "langchain/embeddings/openai";
import {getOpenAISettings} from "@/modules/openai/openai.client";
import {PineconeStore} from "langchain/vectorstores/pinecone";


/**
 * 'Proxy' that uploads a file to paste.gg.
 * Called by the UI to avoid CORS issues, as the browser cannot post directly to paste.gg.
 */
export default async function handler(req: NextRequest) {

    try {
        const {to, question, dbHost, indexdb, docsCount, openaiKey, origin} = await req.json();
        if (req.method !== 'POST' || to !== 'pinecone.com' || !question)
            throw new Error('Invalid options');
        const index = !indexdb ? "index" : indexdb
        let defaultPrompt: string = "Use the following pieces of context to answer the users question. \\nIf you don't know the answer, just say that you don't know, don't try to make up an answer.\\n----------------\\n";
        const client = new PineconeClient();
        await client.init({
            apiKey: dbHost,
            environment: 'northamerica-northeast1-gcp',
        });

        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: openaiKey
        });
        const pineconeIndex = client.Index(index);
        const docsearch = await PineconeStore.fromExistingIndex(embeddings, {pineconeIndex});
        const docs = await docsearch.similaritySearch(question, docsCount);
        let docsString: string = docs.map(doc => doc.pageContent).join("\\n\\n");
        docsString = defaultPrompt + docsString;

        return new NextResponse(JSON.stringify({
            type: 'success',
            //url: `https://paste.gg/${paste.result.id}`,
            //expires: paste.result.expires || 'never',
            //deletionKey: paste.result.deletion_key || 'none',
            prompt: docsString,
        }));

    } catch (error) {

        console.error('api/publish error:', error);
        return new NextResponse(JSON.stringify({
            type: 'error',
            error: error?.toString() || 'Network issue',
        }), {status: 500});

    }

}

// noinspection JSUnusedGlobalSymbols
export const config = {
    runtime: 'edge',
};