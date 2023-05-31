export namespace Embeddings {

  /// Client (Browser) -> Server (Next.js)
  export namespace API {

    export namespace Imagine {
      export interface RequestBody {
        apiKey?: string;
        prodiaModelId: string;
        prompt: string;
        negativePrompt?: string;
        steps?: number;
        cfgScale?: number;
        seed?: number;
      }

      export type Response = (
        { status: 'success', imageUrl: string, altText: string }
        | { status: 'error', error: string }
        ) & { elapsed: number };
    }

    export namespace Models {
      export interface RequestBody {
        apiKey?: string;
      }

      export interface Response {
        models: {
          id: string;
          label: string;
          priority?: number;
        }[];
      }
    }

  }

  /// This is the upstream API [rev-eng on 2023-04-22], for Server (Next.js) -> Upstream Server
  export namespace Wire {
    export namespace Imagine {
      export interface JobRequest {
        model: 'sdv1_4.ckpt [7460a6fa]' | string;
        prompt: string;
        // optional, and not even documented, but inferred from the response data
        cfg_scale?: number;
        steps?: number;
        negative_prompt?: string;
        seed?: number;
      }

      export interface JobResponse {
        job: string;
        params: {
          prompt: string;
          cfg_scale: number;
          steps: number;
          negative_prompt: string;
          seed: number;
          upscale: boolean;
          sampler_name: 'Euler' | string;
          width: 512 | number;
          height: 512 | number;
          options: { sd_model_checkpoint: 'sdv1_4.ckpt [7460a6fa]' | string; };
        };
        status: 'queued' | 'generating' | 'succeeded' | 'failed';
        imageUrl?: string;
      }
    }
  }
}
