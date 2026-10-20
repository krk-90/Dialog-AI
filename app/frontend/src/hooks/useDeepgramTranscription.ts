import { useCallback, useEffect, useRef, useState } from "react";

export type LiveTranscriptSegment = {
  id: string;
  text: string;
  isFinal: boolean;
  speaker: "Voice 1" | "Voice 2" | "Unknown";
  receivedAt: number;
};
type Status = "idle" | "connecting" | "listening" | "error";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
type Options = { tokenEndpoint?: string; onSegment?: (segment: LiveTranscriptSegment) => void };

export function useDeepgramTranscription({ tokenEndpoint = `${API_BASE_URL}/api/transcription/deepgram-token`, onSegment }: Options = {}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([]);
  const mediaRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef(onSegment);
  const activeRef = useRef(false);
  callbackRef.current = onSegment;

  const stop = useCallback(() => {
    activeRef.current = false;
    recorderRef.current?.stop();
    recorderRef.current = null;
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      try { socket.send(JSON.stringify({ type: "CloseStream" })); } catch { /* Socket may already be closing. */ }
      socket.close(1000, "User stopped transcription");
    }
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is unavailable. Use HTTPS or localhost and check browser permissions.");
      if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support MediaRecorder. Use a current version of Chrome, Edge, or Firefox.");
      const tokenResponse = await fetch(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ttl_seconds: 60 }) });
      if (!tokenResponse.ok) throw new Error(tokenResponse.status === 404 ? "The secure transcription-token endpoint is not connected yet. Manual transcript entry remains available." : "Could not start secure transcription. Check backend configuration.");
      const tokenData: { access_token?: string } = await tokenResponse.json();
      if (!tokenData.access_token) throw new Error("The transcription service did not return a temporary access token.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mediaRef.current = stream;
      const socket = new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&diarize=true&utterance_end_ms=1000&vad_events=true", ["bearer", tokenData.access_token]);
      socketRef.current = socket;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Speech service connection timed out. You can continue with manual transcript entry.")), 10000);
        socket.onopen = () => { window.clearTimeout(timeout); resolve(); };
        socket.onerror = () => { window.clearTimeout(timeout); reject(new Error("Could not connect to the speech service. Check your connection or use manual mode.")); };
        socket.onclose = (event) => {
          window.clearTimeout(timeout);
          if (socket.readyState !== WebSocket.OPEN && !activeRef.current) {
            reject(new Error("Speech connection closed before transcription started. Manual entry remains available."));
          } else if (activeRef.current && event.code !== 1000) {
            setError("Speech connection closed. Manual transcript entry is still available.");
          }
        };
      });
      if (!stream.active || socket.readyState !== WebSocket.OPEN) throw new Error("Audio session ended before transcription could start.");
      activeRef.current = true;
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== "Results") return;
          const alternative = payload.channel?.alternatives?.[0];
          const text = String(alternative?.transcript ?? "").trim();
          if (!text) return;
          const speakerIndex = alternative?.words?.[0]?.speaker;
          // Diarization identifies distinct voices, not their real-world identity.
          const speaker: LiveTranscriptSegment["speaker"] = Number.isInteger(speakerIndex) ? (speakerIndex === 0 ? "Voice 1" : "Voice 2") : "Unknown";
          const segment: LiveTranscriptSegment = { id: crypto.randomUUID(), text, isFinal: Boolean(payload.is_final), speaker, receivedAt: Date.now() };
          setSegments((previous) => {
            const next = segment.isFinal ? [...previous, segment] : [...previous.filter((item) => item.isFinal), segment];
            return next.slice(-200);
          });
          callbackRef.current?.(segment);
        } catch { /* Ignore malformed provider messages; keep the call UI alive. */ }
      };
      socket.onclose = () => {
        if (activeRef.current) {
          activeRef.current = false;
          recorderRef.current?.stop();
          mediaRef.current?.getTracks().forEach((track) => track.stop());
          setStatus("error");
          setError("Speech connection closed. Switch to manual transcript entry or reconnect.");
        }
      };
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size && socket.readyState === WebSocket.OPEN) socket.send(event.data);
      };
      recorder.onerror = () => setError("Microphone recording failed. Manual transcript entry remains available.");
      recorder.start(250);
      setStatus("listening");
    } catch (cause) {
      mediaRef.current?.getTracks().forEach((track) => track.stop());
      mediaRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
      activeRef.current = false;
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Transcription could not start. Use manual mode.");
    }
  }, [tokenEndpoint]);

  useEffect(() => () => {
    activeRef.current = false;
    recorderRef.current?.stop();
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    socketRef.current?.close();
  }, []);

  return { status, error, segments, start, stop, clearError: () => setError(null) };
}
