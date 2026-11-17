import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Mic,
  MicOff,
  Image as ImageIcon,
  Film,
  Send,
  Brain,
  Upload,
} from 'lucide-react';
import type {
  HostelBlock,
  Room,
  Student,
  Allocation,
} from '../utils/allocation';

interface AiStudioViewProps {
  blocks: HostelBlock[];
  rooms: Room[];
  students: Student[];
  allocations: Allocation[];
}

type StudioSubTab = 'chat' | 'voice' | 'image' | 'video';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  model?: string;
}

const ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
] as const;

export function AiStudioView({
  blocks,
  rooms,
  students,
  allocations,
}: AiStudioViewProps) {
  const [subTab, setSubTab] = useState<StudioSubTab>('chat');

  // Chat state
  const [chatModel, setChatModel] = useState<
    | 'gemini-4-hydrogen'
    | 'gemini-3.1-flash-lite'
    | 'gemini-4-argon'
    | 'gemini-4-carbon'
  >('gemini-4-hydrogen');
  const [highThinking, setHighThinking] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Welcome to the Northgate Halls Advisor. Ask me to plan waitlist placements, evaluate room utilization, or draft student notices.',
      model: 'gemini-4-hydrogen',
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Voice Live API state
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Disconnected');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscripts, setVoiceTranscripts] = useState<
    Array<{ speaker: 'You' | 'Concierge'; text: string }>
  >([]);
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  // Image Studio state
  const [imgPrompt, setImgPrompt] = useState(
    'Architectural interior of a quiet university graduate hostel study lounge with warm oak tables and floor-to-ceiling windows'
  );
  const [imgAspectRatio, setImgAspectRatio] =
    useState<(typeof ASPECT_RATIOS)[number]>('16:9');
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(
    null
  );
  const [sourceMimeType, setSourceMimeType] = useState<string>('image/png');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(
    null
  );
  const [imgCaption, setImgCaption] = useState('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // Video Tour state
  const [vidPrompt, setVidPrompt] = useState(
    'Slow architectural camera glide through a sunlit modern university residence courtyard with brick facades and landscaped paths'
  );
  const [vidAspectRatio, setVidAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null
  );
  const [vidLoading, setVidLoading] = useState(false);
  const [vidError, setVidError] = useState<string | null>(null);

  const hostelSummary = `Blocks: ${blocks
    .map((b) => `${b.name} (${b.genderPolicy})`)
    .join('; ')}. Rooms: ${rooms.length} total, ${
    rooms.filter((r) => r.occupiedCount < r.capacity && r.status !== 'Maintenance')
      .length
  } with vacant beds. Students: ${students.length} total, ${
    allocations.filter((a) => a.status === 'Active').length
  } assigned.`;

  const handleChatSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    const nextHistory = [...chatMessages];
    setChatMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chatModel,
          highThinking: chatModel === 'gemini-4-carbon' && highThinking,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          message: trimmed,
          hostelSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat request failed.');
      setChatMessages((prev) => [
        ...prev,
        { role: 'model', text: data.text, model: data.model },
      ]);
    } catch (err: unknown) {
      setChatError(
        err instanceof Error ? err.message : 'Unable to get AI response.'
      );
    } finally {
      setChatLoading(false);
    }
  };

  // PCM Audio Helpers for Live API
  const float32ToBase64Pcm = (float32: Float32Array): string => {
    const buffer = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32.length; i += 1) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const playPcm24kChunk = (ctx: AudioContext, base64: string) => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) {
      float32[i] = int16[i] / 32768;
    }
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
  };

  const stopVoiceSession = () => {
    wsRef.current?.close();
    wsRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    inputAudioCtxRef.current?.close();
    inputAudioCtxRef.current = null;
    outputAudioCtxRef.current?.close();
    outputAudioCtxRef.current = null;
    nextStartTimeRef.current = 0;
    setVoiceConnected(false);
    setVoiceStatus('Disconnected');
  };

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  const startVoiceSession = async () => {
    setVoiceError(null);
    setVoiceStatus('Connecting to Gemini Live...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.ready) {
          setVoiceConnected(true);
          setVoiceStatus('Live · Listening (16kHz PCM)');
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(inputCtx.destination);
          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const b64 = float32ToBase64Pcm(e.inputBuffer.getChannelData(0));
              ws.send(JSON.stringify({ audio: b64 }));
            }
          };
        }
        if (msg.audio && outputAudioCtxRef.current) {
          playPcm24kChunk(outputAudioCtxRef.current, msg.audio);
        }
        if (msg.interrupted) {
          nextStartTimeRef.current = outputAudioCtxRef.current?.currentTime ?? 0;
        }
        if (msg.inputTranscript) {
          setVoiceTranscripts((prev) => [
            ...prev,
            { speaker: 'You', text: msg.inputTranscript },
          ]);
        }
        if (msg.outputTranscript) {
          setVoiceTranscripts((prev) => [
            ...prev,
            { speaker: 'Concierge', text: msg.outputTranscript },
          ]);
        }
        if (msg.error) {
          setVoiceError(msg.error);
          stopVoiceSession();
        }
      };

      ws.onerror = () => {
        setVoiceError('WebSocket connection error with Live API.');
        stopVoiceSession();
      };

      ws.onclose = () => {
        setVoiceConnected(false);
        setVoiceStatus('Disconnected');
      };
    } catch (err: unknown) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Microphone access or Live session initialization failed.'
      );
      stopVoiceSession();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mimeMatch = header.match(/data:(.*?);/);
      setSourceMimeType(mimeMatch?.[1] ?? 'image/png');
      setSourceImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgPrompt.trim()) return;
    setImgLoading(true);
    setImgError(null);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          aspectRatio: imgAspectRatio,
          sourceImageBase64: sourceImageBase64 ?? undefined,
          sourceMimeType: sourceImageBase64 ? sourceMimeType : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed.');
      setGeneratedImageUrl(data.imageUrl);
      setImgCaption(data.caption || '');
    } catch (err: unknown) {
      setImgError(
        err instanceof Error ? err.message : 'Unable to generate image.'
      );
    } finally {
      setImgLoading(false);
    }
  };

  const handleUseOutputForEdit = () => {
    if (!generatedImageUrl) return;
    const [header, base64] = generatedImageUrl.split(',');
    const mimeMatch = header.match(/data:(.*?);/);
    setSourceMimeType(mimeMatch?.[1] ?? 'image/png');
    setSourceImageBase64(base64);
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidPrompt.trim()) return;
    setVidLoading(true);
    setVidError(null);
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: vidPrompt,
          aspectRatio: vidAspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Video generation failed.');
      setGeneratedVideoUrl(data.videoUrl);
    } catch (err: unknown) {
      setVidError(
        err instanceof Error ? err.message : 'Unable to generate video.'
      );
    } finally {
      setVidLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab bar */}
      <div
        className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl"
        role="tablist"
        aria-label="AI Studio capabilities"
      >
        {(
          [
            { id: 'chat', label: 'Advisor Chat', icon: MessageSquare },
            { id: 'voice', label: 'Voice Concierge', icon: Mic },
            { id: 'image', label: 'Room Visualizer', icon: ImageIcon },
            { id: 'video', label: 'Video Tour', icon: Film },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subTab === tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 ${
                subTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 1. Multi-Turn Chatbot + High Thinking */}
      {subTab === 'chat' && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Multi-Turn Operations Advisor
              </h3>
              <p className="text-xs text-slate-500">
                System Role: Northgate Halls Warden Strategist · Preserves full conversation history
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="chat-model-select"
                className="text-xs font-medium text-slate-600"
              >
                Model
              </label>
              <select
                id="chat-model-select"
                value={chatModel}
                onChange={(e) =>
                  setChatModel(e.target.value as typeof chatModel)
                }
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-900"
              >
                <option value="gemini-4-hydrogen">
                  gemini-4-hydrogen (General)
                </option>
                <option value="gemini-3.1-flash-lite">
                  gemini-3.1-flash-lite (Fast Triage)
                </option>
                <option value="gemini-4-argon">
                  gemini-4-argon (Complex Interactive)
                </option>
                <option value="gemini-4-carbon">
                  gemini-4-carbon (Deep Reasoning)
                </option>
              </select>

              {chatModel === 'gemini-4-carbon' && (
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={highThinking}
                    onChange={(e) => setHighThinking(e.target.checked)}
                    className="rounded border-blue-400"
                  />
                  <Brain className="w-3.5 h-3.5" aria-hidden="true" />
                  High Thinking
                </label>
              )}
            </div>
          </div>

          <div className="p-6 space-y-4 h-96 overflow-y-auto bg-slate-50/40">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-2xl rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="mt-1 text-xs text-slate-400">
                  {msg.role === 'user'
                    ? 'Warden'
                    : `Advisor · ${msg.model ?? chatModel}`}
                </span>
              </div>
            ))}
            {chatLoading && (
              <div className="text-xs text-slate-500">
                Generating response with {chatModel}...
              </div>
            )}
          </div>

          {chatError && (
            <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {chatError}
            </div>
          )}

          <div className="px-6 py-2.5 border-t border-slate-100 bg-slate-50/70 flex flex-wrap gap-2">
            {[
              'Suggest optimal rooms for waitlisted students considering gender policy.',
              'Draft an orientation welcome memo for Fall 2026 Wing A residents.',
              'Audit our single vs twin occupancy revenue balance.',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setChatInput(preset)}
                className="text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-md"
              >
                {preset}
              </button>
            ))}
          </div>

          <form
            onSubmit={handleChatSend}
            className="p-4 border-t border-slate-200 flex gap-3 bg-white"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              aria-label="Ask the Hostel Operations Advisor"
              placeholder="Ask about room capacity, waitlist balancing, or complex policy..."
              className="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              Send
            </button>
          </form>
        </section>
      )}

      {/* 2. Live Voice Concierge (gemini-3.8-live) */}
      {subTab === 'voice' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Real-Time Hostel Voice Desk (gemini-3.8-live)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Bidirectional 16kHz/24kHz PCM voice conversation over WebSocket for front-desk queries and move-in guidance.
              </p>
            </div>
            <button
              type="button"
              onClick={voiceConnected ? stopVoiceSession : startVoiceSession}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                voiceConnected
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-700 hover:bg-blue-800 text-white'
              }`}
            >
              {voiceConnected ? (
                <>
                  <MicOff className="w-4 h-4" aria-hidden="true" />
                  End Voice Session
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" aria-hidden="true" />
                  Start Voice Conversation
                </>
              )}
            </button>
          </div>

          <div className="text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            Session State: {voiceStatus}
          </div>

          {voiceError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {voiceError}
            </div>
          )}

          <div className="border border-slate-200 rounded-xl p-4 h-64 overflow-y-auto space-y-3 bg-slate-50/40">
            {voiceTranscripts.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-20">
                Start a voice session and speak naturally to ask about room availability, quiet hours, or move-in steps.
              </p>
            ) : (
              voiceTranscripts.map((t, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-semibold text-slate-900 mr-2">
                    {t.speaker}:
                  </span>
                  <span className="text-slate-700">{t.text}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 3. Image Creation & Editing (gemini-nano-banana-2.1) */}
      {subTab === 'image' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Hostel Wing & Room Visualizer (gemini-nano-banana-2.1)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Generate architectural concepts or edit uploaded room photos across 8 aspect ratios.
            </p>
          </div>

          <form onSubmit={handleGenerateImage} className="space-y-4">
            <div>
              <label
                htmlFor="img-prompt"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Visual Prompt or Edit Instruction
              </label>
              <textarea
                id="img-prompt"
                rows={3}
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="block text-xs font-medium text-slate-700 mb-1.5">
                  Aspect Ratio
                </span>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Select image aspect ratio"
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setImgAspectRatio(ratio)}
                      className={`px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                        imgAspectRatio === ratio
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  {sourceImageBase64 ? 'Reference Attached' : 'Attach Photo to Edit'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                </label>
                {sourceImageBase64 && (
                  <button
                    type="button"
                    onClick={() => setSourceImageBase64(null)}
                    className="text-xs text-red-700 hover:underline"
                  >
                    Clear Photo
                  </button>
                )}
                <button
                  type="submit"
                  disabled={imgLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 whitespace-nowrap"
                >
                  {imgLoading
                    ? 'Rendering...'
                    : sourceImageBase64
                      ? 'Edit Image'
                      : 'Generate Image'}
                </button>
              </div>
            </div>
          </form>

          {imgError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {imgError}
            </div>
          )}

          {generatedImageUrl && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">
                  Generated Output ({imgAspectRatio})
                </span>
                <button
                  type="button"
                  onClick={handleUseOutputForEdit}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Use as Edit Reference
                </button>
              </div>
              <img
                src={generatedImageUrl}
                alt="Generated hostel room concept"
                referrerPolicy="no-referrer"
                className="max-h-96 rounded-xl border border-slate-200 object-contain bg-slate-50"
              />
              {imgCaption && (
                <p className="text-xs text-slate-600">{imgCaption}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4. Video Generation (gemini-omni-1.2-flash via Interactions API) */}
      {subTab === 'video' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Hostel Walkthrough Video Generator (gemini-omni-1.2-flash)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Generate 5-second residence walkthrough previews via the Gemini Interactions API in 16:9 or 9:16.
            </p>
          </div>

          <form onSubmit={handleGenerateVideo} className="space-y-4">
            <div>
              <label
                htmlFor="vid-prompt"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Video Scene Prompt
              </label>
              <textarea
                id="vid-prompt"
                rows={3}
                value={vidPrompt}
                onChange={(e) => setVidPrompt(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div
                className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
                role="group"
                aria-label="Select video aspect ratio"
              >
                {(
                  [
                    { id: '16:9', label: '16:9 Landscape' },
                    { id: '9:16', label: '9:16 Portrait' },
                  ] as const
                ).map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => setVidAspectRatio(ratio.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      vidAspectRatio === ratio.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={vidLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 whitespace-nowrap"
              >
                {vidLoading ? 'Generating Video (up to 60s)...' : 'Generate Tour Video'}
              </button>
            </div>
          </form>

          {vidError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {vidError}
            </div>
          )}

          {generatedVideoUrl && (
            <div className="border-t border-slate-100 pt-4">
              <video
                src={generatedVideoUrl}
                controls
                className="max-h-96 rounded-xl border border-slate-200 bg-slate-950"
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
