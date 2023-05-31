// noinspection JSUnusedGlobalSymbols

declare namespace NodeJS {

  // available to the server-side
  interface ProcessEnv {

    // OpenAI - chat.ts
    OPENAI_API_KEY: string;
    OPENAI_API_ORG_ID: string;
    OPENAI_API_HOST: string;

    // Helicone
    HELICONE_API_KEY: string;

    // ElevenLabs - speech.ts
    ELEVENLABS_API_KEY: string;
    ELEVENLABS_API_HOST: string;
    ELEVENLABS_VOICE_ID: string;

    // Prodia - imagine.ts
    PRODIA_API_KEY: string;

    // Google Custom Search
    GOOGLE_CLOUD_API_KEY: string;
    GOOGLE_CSE_ID: string;

    //vector database
    VECTORDB_API_HOST: string;
  }

  interface ProcessEnv {

    // set in next.config.js and available to the client-side
    HAS_SERVER_KEY_OPENAI: boolean;
    HAS_SERVER_KEY_ELEVENLABS: boolean;
    HAS_SERVER_KEY_PRODIA: boolean;
    HAS_SERVER_KEYS_GOOGLE_CSE: boolean;
    HAS_SERVER_KEY_OPENAI_EMBEDDINGS: boolean;

  }
}
