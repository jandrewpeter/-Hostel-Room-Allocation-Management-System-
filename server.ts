import http from 'http';
import path from 'path';
import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { LiveServerMessage, Modality } from '@google/genai';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  getHostelState,
  createStudentRecord,
  updateStudentFeeStatus,
  deleteStudentRecord,
  allocateBed,
  vacateBed,
  transferBed,
  toggleRoomMaintenance,
  createRoomRecord,
  createMaintenanceLog,
  resolveMaintenanceLog,
} from './src/db/hostel.ts';
import {
  getGeminiClient,
  formatGeminiError,
  runHostelChat,
  runSearchGrounding,
  runMapsGrounding,
  generateOrEditHostelImage,
  generateHostelTourVideo,
  SUPPORTED_ASPECT_RATIOS,
  type AllowedChatModel,
  type ImageAspectRatio,
} from './src/lib/gemini.ts';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Protected Cloud SQL Hostel Operations API
app.get('/api/hostel/state', requireAuth, async (req: AuthRequest, res) => {
  try {
    const state = await getHostelState(req.user!.uid);
    res.json({
      ...state,
      currentUser: {
        uid: req.user!.uid,
        email: req.user!.email ?? '',
        name: req.user!.name ?? req.user!.email?.split('@')[0] ?? 'Warden',
      },
    });
  } catch (error: unknown) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to load hostel state.',
    });
  }
});

app.post('/api/hostel/students', requireAuth, async (req, res) => {
  try {
    const student = await createStudentRecord(req.body);
    res.status(201).json(student);
  } catch (error: unknown) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Failed to register student.',
    });
  }
});

app.patch('/api/hostel/students/:id/fee', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await updateStudentFeeStatus(id, req.body.feeStatus);
    res.json(updated);
  } catch (error: unknown) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Failed to update fee status.',
    });
  }
});

app.delete('/api/hostel/students/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const deleted = await deleteStudentRecord(id);
    res.json(deleted);
  } catch (error: unknown) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Failed to delete student.',
    });
  }
});

app.post('/api/hostel/rooms', requireAuth, async (req, res) => {
  try {
    const created = await createRoomRecord(req.body);
    res.status(201).json(created);
  } catch (error: unknown) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create room.',
    });
  }
});

app.patch('/api/hostel/rooms/:id/maintenance', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await toggleRoomMaintenance(id, Boolean(req.body.maintenance));
    res.json(updated);
  } catch (error: unknown) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Failed to update room status.',
    });
  }
});

app.post('/api/hostel/allocations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const created = await allocateBed({
      studentId: Number(req.body.studentId),
      roomId: Number(req.body.roomId),
      academicTerm: req.body.academicTerm,
      notes: req.body.notes,
      uid: req.user!.uid,
    });
    res.status(201).json(created);
  } catch (error: unknown) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Failed to allocate bed.',
    });
  }
});

app.post(
  '/api/hostel/allocations/:id/vacate',
  requireAuth,
  async (req, res) => {
    try {
      const updated = await vacateBed(Number(req.params.id));
      res.json(updated);
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to vacate bed.',
      });
    }
  }
);

app.post(
  '/api/hostel/allocations/:id/transfer',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const created = await transferBed({
        allocationId: Number(req.params.id),
        targetRoomId: Number(req.body.targetRoomId),
        uid: req.user!.uid,
      });
      res.status(201).json(created);
    } catch (error: unknown) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Failed to transfer resident.',
      });
    }
  }
);

app.post('/api/hostel/maintenance', requireAuth, async (req, res) => {
  try {
    const created = await createMaintenanceLog({
      roomId: Number(req.body.roomId),
      title: req.body.title,
      priority: req.body.priority,
    });
    res.status(201).json(created);
  } catch (error: unknown) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create maintenance log.',
    });
  }
});

app.patch(
  '/api/hostel/maintenance/:id/resolve',
  requireAuth,
  async (req, res) => {
    try {
      const updated = await resolveMaintenanceLog(Number(req.params.id));
      res.json(updated);
    } catch (error: unknown) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to resolve maintenance log.',
      });
    }
  }
);

// Server-Side Gemini AI Routes
app.post('/api/ai/chat', async (req, res) => {
  try {
    const allowedModels: AllowedChatModel[] = [
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
      'gemini-4-argon',
      'gemini-4-carbon',
    ];
    const model: AllowedChatModel = allowedModels.includes(req.body.model)
      ? req.body.model
      : 'gemini-4-hydrogen';

    if (!req.body.message || typeof req.body.message !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const result = await runHostelChat({
      model,
      history: Array.isArray(req.body.history) ? req.body.history : [],
      message: req.body.message,
      highThinking: Boolean(req.body.highThinking),
      hostelSummary:
        typeof req.body.hostelSummary === 'string'
          ? req.body.hostelSummary
          : undefined,
    });
    res.json(result);
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/grounding/search', async (req, res) => {
  try {
    if (!req.body.query || typeof req.body.query !== 'string') {
      return res.status(400).json({ error: 'Search query is required.' });
    }
    const result = await runSearchGrounding(req.body.query);
    res.json(result);
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/grounding/maps', async (req, res) => {
  try {
    if (!req.body.query || typeof req.body.query !== 'string') {
      return res.status(400).json({ error: 'Location query is required.' });
    }
    const result = await runMapsGrounding({
      query: req.body.query,
      latitude:
        typeof req.body.latitude === 'number' ? req.body.latitude : undefined,
      longitude:
        typeof req.body.longitude === 'number' ? req.body.longitude : undefined,
    });
    res.json(result);
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/image', async (req, res) => {
  try {
    if (!req.body.prompt || typeof req.body.prompt !== 'string') {
      return res.status(400).json({ error: 'Image prompt is required.' });
    }
    const aspectRatio = SUPPORTED_ASPECT_RATIOS.includes(req.body.aspectRatio)
      ? (req.body.aspectRatio as ImageAspectRatio)
      : '16:9';

    const result = await generateOrEditHostelImage({
      prompt: req.body.prompt,
      aspectRatio,
      sourceImageBase64: req.body.sourceImageBase64,
      sourceMimeType: req.body.sourceMimeType,
    });
    res.json(result);
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/video', async (req, res) => {
  try {
    if (!req.body.prompt || typeof req.body.prompt !== 'string') {
      return res.status(400).json({ error: 'Video prompt is required.' });
    }
    const aspectRatio = req.body.aspectRatio === '9:16' ? '9:16' : '16:9';
    const result = await generateHostelTourVideo({
      prompt: req.body.prompt,
      aspectRatio,
    });
    res.json(result);
  } catch (error) {
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

async function startServer() {
  const server = http.createServer(app);

  // Real-Time Gemini Live API WebSocket bridge
  const wss = new WebSocketServer({ server, path: '/api/live' });
  wss.on('connection', async (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<ReturnType<typeof getGeminiClient>['live']['connect']>> | null = null;
    try {
      const ai = getGeminiClient();
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction:
            'You are the Northgate Halls Voice Concierge. Assist university hostel wardens and students concisely with room types, move-in procedures, quiet hours, and hostel allocation policies.',
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  inputTranscript: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  outputTranscript: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({ audio: part.inlineData.data })
                );
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              const formatted = formatGeminiError(err);
              clientWs.send(JSON.stringify({ error: formatted.message }));
            }
          },
        },
      });

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }
    } catch (error) {
      const formatted = formatGeminiError(error);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: formatted.message }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text && liveSession) {
          liveSession.sendRealtimeInput({
            text: parsed.text,
          });
        }
      } catch (err) {
        console.error('Live WebSocket message error:', err);
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Northgate Halls server listening on http://localhost:${PORT}`);
  });
}

startServer();
