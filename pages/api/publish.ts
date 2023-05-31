// noinspection ExceptionCaughtLocallyJS

import { NextRequest, NextResponse } from 'next/server';

import { PasteGG } from '@/modules/pastegg/pastegg.types';
import { pasteGgPost } from '@/modules/pastegg/pastegg.server';


/**
 * 'Proxy' that uploads a file to paste.gg.
 * Called by the UI to avoid CORS issues, as the browser cannot post directly to paste.gg.
 */
export default async function handler(req: NextRequest) {

    try {

        const { to, title, fileContent, fileName, origin }: PasteGG.API.Publish.RequestBody = await req.json();
        if (req.method !== 'POST' || to !== 'paste.gg' || !title || !fileContent || !fileName)
            throw new Error('Invalid options');

        const paste = await pasteGgPost(title, fileName, fileContent, origin);
        console.log(`Posted to paste.gg`, paste);

        if (paste?.status !== 'success')
            throw new Error(`${paste?.error || 'Unknown error'}: ${paste?.message || 'Paste.gg Error'}`);

        return new NextResponse(JSON.stringify({
            type: 'success',
            url: `https://paste.gg/${paste.result.id}`,
            expires: paste.result.expires || 'never',
            deletionKey: paste.result.deletion_key || 'none',
            created: paste.result.created_at,
        } satisfies PasteGG.API.Publish.Response));

    } catch (error) {

        console.error('api/publish error:', error);
        return new NextResponse(JSON.stringify({
            type: 'error',
            error: error?.toString() || 'Network issue',
        } satisfies PasteGG.API.Publish.Response), { status: 500 });

    }

}

// noinspection JSUnusedGlobalSymbols
export const config = {
    runtime: 'edge',
};