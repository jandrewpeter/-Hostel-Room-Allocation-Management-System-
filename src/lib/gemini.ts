import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatGeminiError(error: unknown): {
  status: number;
  message: string;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('429') || lower.includes('resource_exhausted')) {
    return {
      status: 429,
      message:
        'Quota limit reached or paid model requires a billing-enabled key. You can select a paid API key in Settings > Secrets, or switch to gemini-4-hydrogen / gemini-3.1-flash-lite.',
    };
  }
  if (lower.includes('403') || lower.includes('permission_denied')) {
    return {
      status: 403,
      message:
        'Permission denied for this Gemini API key. Verify your key in Settings > Secrets.',
    };
  }
  if (lower.includes('400') || lower.includes('api_key_invalid')) {
    return {
      status: 400,
      message: raw,
    };
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return {
      status: 404,
      message: `Requested Gemini model endpoint not found: ${raw}`,
    };
  }
  return {
    status: 500,
    message: raw || 'Upstream Gemini request failed.',
  };
}

export type AllowedChatModel =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-argon'
  | 'gemini-4-carbon';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export async function runHostelChat(params: {
  model: AllowedChatModel;
  history: ChatTurn[];
  message: string;
  highThinking?: boolean;
  hostelSummary?: string;
}) {
  const ai = getGeminiClient();

  const systemInstruction = `You are Northgate Halls Operations Advisor, an expert university hostel warden and room allocation strategist.
Use clear, structured administrative guidance. Respect block gender policies (Male, Female, Co-Ed), room capacity limits, maintenance holds, and fee collection compliance.
${params.hostelSummary ? `\nLive Hostel Context:\n${params.hostelSummary}` : ''}`;

  const config: Record<string, unknown> = {
    systemInstruction,
  };

  if (params.model === 'gemini-4-carbon' && params.highThinking) {
    config.thinkingConfig = {
      thinkingLevel: ThinkingLevel.HIGH,
    };
  }

  const contents = [
    ...params.history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: params.message }],
    },
  ];

  const response = await ai.models.generateContent({
    model: params.model,
    contents,
    config,
  });

  return {
    text: response.text ?? '',
    model: params.model,
  };
}

export async function runSearchGrounding(query: string) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: query,
    config: {
      systemInstruction:
        'You are a university campus housing and student affairs research assistant. Provide up-to-date, accurate answers grounded in web search results.',
      tools: [{ googleSearch: {} }],
    },
  });

  const chunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .filter((c) => c.web?.uri)
    .map((c) => ({
      title: c.web?.title ?? c.web?.uri ?? 'Source',
      uri: c.web?.uri ?? '',
    }));

  return {
    text: response.text ?? '',
    sources,
  };
}

export async function runMapsGrounding(params: {
  query: string;
  latitude?: number;
  longitude?: number;
}) {
  const ai = getGeminiClient();
  const hasCoords =
    typeof params.latitude === 'number' && typeof params.longitude === 'number';

  const config: Record<string, unknown> = {
    tools: [{ googleMaps: {} }],
  };

  if (hasCoords) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: params.latitude,
          longitude: params.longitude,
        },
      },
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: params.query,
    config,
  });

  const chunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

  const places = chunks
    .filter((c) => c.maps?.uri)
    .map((c) => ({
      title: c.maps?.title ?? 'Location',
      uri: c.maps?.uri ?? '',
      snippets:
        c.maps?.placeAnswerSources?.reviewSnippets?.map(
          (s) => s.review ?? s.title ?? ''
        ).filter(Boolean) ?? [],
    }));

  return {
    text: response.text ?? '',
    places,
  };
}

export const SUPPORTED_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
] as const;

export type ImageAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

export async function generateOrEditHostelImage(params: {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  sourceImageBase64?: string;
  sourceMimeType?: string;
}) {
  const ai = getGeminiClient();

  const parts: Array<
    | { text: string }
    | { inlineData: { data: string; mimeType: string } }
  > = [];

  if (params.sourceImageBase64 && params.sourceMimeType) {
    parts.push({
      inlineData: {
        data: params.sourceImageBase64,
        mimeType: params.sourceMimeType,
      },
    });
  }

  parts.push({ text: params.prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-nano-banana-2.1',
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: params.aspectRatio,
        imageSize: '1K',
      },
    },
  });

  let imageUrl = '';
  let caption = '';

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      imageUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (part.text) {
      caption += part.text;
    }
  }

  if (!imageUrl) {
    throw new Error('No image was returned by gemini-nano-banana-2.1.');
  }

  return {
    imageUrl,
    caption,
    aspectRatio: params.aspectRatio,
  };
}

export async function generateHostelTourVideo(params: {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
}) {
  const ai = getGeminiClient();

  const interaction = await ai.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input: params.prompt,
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: params.aspectRatio,
        duration: '5s',
        resolution: '720p',
      },
    },
    { timeout: 300000 }
  );

  const videoPart = interaction.output_video;
  if (!videoPart?.data) {
    throw new Error('No video output was returned by gemini-omni-1.2-flash.');
  }

  const mime = videoPart.mime_type ?? 'video/mp4';
  return {
    videoUrl: `data:${mime};base64,${videoPart.data}`,
    aspectRatio: params.aspectRatio,
  };
}
