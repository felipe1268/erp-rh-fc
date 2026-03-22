import { useRef, useEffect, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { Camera, CheckCircle, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const MODELS_URL = "/models";

export interface FaceMatch {
  employeeId: number;
  nomeCompleto: string;
  numeroInterno: string;
  cargo: string;
  fotoUrl: string | null;
  distance: number;
  descriptor: Float32Array;
}

export interface KnownFace {
  employeeId: number;
  nomeCompleto: string;
  numeroInterno: string;
  cargo: string;
  fotoUrl: string | null;
  descriptor: number[];
}

interface Props {
  mode: "enroll" | "recognize";
  knownFaces?: KnownFace[];
  onCapture?: (descriptor: Float32Array, fotoBase64: string) => void;
  onMatch?: (match: FaceMatch, fotoBase64: string) => void;
  onNoMatch?: () => void;
  autoCapture?: boolean;
  threshold?: number;
}

let modelsLoaded = false;
let modelsLoading = false;
const modelsReadyListeners: Array<() => void> = [];

async function ensureModels() {
  if (modelsLoaded) return;
  if (modelsLoading) {
    return new Promise<void>((resolve) => {
      modelsReadyListeners.push(resolve);
    });
  }
  modelsLoading = true;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  modelsLoaded = true;
  modelsLoading = false;
  modelsReadyListeners.forEach((fn) => fn());
  modelsReadyListeners.length = 0;
}

export function FaceCaptureCamera({
  mode,
  knownFaces = [],
  onCapture,
  onMatch,
  onNoMatch,
  autoCapture = false,
  threshold = 0.5,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "detecting" | "captured" | "error">("loading");
  const [statusMsg, setStatusMsg] = useState("Carregando modelos de IA...");
  const [matchResult, setMatchResult] = useState<FaceMatch | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const stopCamera = useCallback(() => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("loading");
    setStatusMsg("Carregando modelos de IA...");
    try {
      await ensureModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          videoRef.current!.onloadedmetadata = () => res();
        });
        videoRef.current.play();
      }
      setStatus("ready");
      setStatusMsg("Posicione o rosto na câmera");
      startDetectionLoop();
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e?.message?.includes("Permission") ? "Permissão de câmera negada" : "Erro ao acessar câmera");
    }
  }, [facingMode]);

  const buildFaceMatcher = useCallback(() => {
    if (!knownFaces.length) return null;
    const labeledDescriptors = knownFaces.map((f) => {
      const desc = new Float32Array(f.descriptor);
      return new faceapi.LabeledFaceDescriptors(String(f.employeeId), [desc]);
    });
    return new faceapi.FaceMatcher(labeledDescriptors, threshold);
  }, [knownFaces, threshold]);

  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = captureRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const startDetectionLoop = useCallback(() => {
    const video = videoRef.current;
    const overlayCanvas = canvasRef.current;
    if (!video || !overlayCanvas) return;

    const detect = async () => {
      if (!video || video.readyState < 2) {
        loopRef.current = requestAnimationFrame(detect);
        return;
      }

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;
      const ctx = overlayCanvas.getContext("2d")!;
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (detections.length > 0) {
        const det = detections[0];
        const box = det.detection.box;

        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.width, box.height, 8);
        ctx.stroke();

        setStatusMsg("Rosto detectado — clique em Capturar");
        setStatus("detecting");

        if (autoCapture && mode === "recognize") {
          const matcher = buildFaceMatcher();
          if (matcher) {
            const result = matcher.findBestMatch(det.descriptor);
            if (result.label !== "unknown") {
              const empId = Number(result.label);
              const emp = knownFaces.find((f) => f.employeeId === empId);
              if (emp) {
                const photo = capturePhoto();
                if (photo) {
                  const match: FaceMatch = {
                    employeeId: emp.employeeId,
                    nomeCompleto: emp.nomeCompleto,
                    numeroInterno: emp.numeroInterno,
                    cargo: emp.cargo,
                    fotoUrl: emp.fotoUrl,
                    distance: result.distance,
                    descriptor: det.descriptor,
                  };
                  setMatchResult(match);
                  setCapturedBase64(photo);
                  setStatus("captured");
                  stopCamera();
                  onMatch?.(match, photo);
                  return;
                }
              }
            }
          }
        }
      } else {
        setStatus("ready");
        setStatusMsg("Posicione o rosto na câmera");
      }

      loopRef.current = requestAnimationFrame(detect);
    };

    loopRef.current = requestAnimationFrame(detect);
  }, [autoCapture, mode, knownFaces, buildFaceMatcher, capturePhoto, onMatch, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video) return;

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      setStatusMsg("Nenhum rosto detectado. Tente novamente.");
      return;
    }

    const photo = capturePhoto()!;
    setCapturedBase64(photo);

    if (mode === "enroll") {
      setStatus("captured");
      setStatusMsg("Rosto capturado com sucesso!");
      stopCamera();
      onCapture?.(detection.descriptor, photo);
    } else {
      const matcher = buildFaceMatcher();
      if (!matcher) {
        setStatus("captured");
        setStatusMsg("Nenhum rosto cadastrado para comparar.");
        stopCamera();
        onCapture?.(detection.descriptor, photo);
        return;
      }
      const result = matcher.findBestMatch(detection.descriptor);
      if (result.label === "unknown") {
        setStatusMsg("Funcionário não reconhecido.");
        onNoMatch?.();
      } else {
        const empId = Number(result.label);
        const emp = knownFaces.find((f) => f.employeeId === empId);
        if (emp) {
          const match: FaceMatch = {
            employeeId: emp.employeeId,
            nomeCompleto: emp.nomeCompleto,
            numeroInterno: emp.numeroInterno,
            cargo: emp.cargo,
            fotoUrl: emp.fotoUrl,
            distance: result.distance,
            descriptor: detection.descriptor,
          };
          setMatchResult(match);
          setStatus("captured");
          setStatusMsg(`Identificado: ${emp.nomeCompleto}`);
          stopCamera();
          onMatch?.(match, photo);
        }
      }
    }
  };

  const handleReset = () => {
    setMatchResult(null);
    setCapturedBase64(null);
    setStatus("loading");
    startCamera();
  };

  const statusColor =
    status === "captured" && matchResult ? "text-green-600" :
    status === "error" ? "text-red-500" :
    status === "detecting" ? "text-green-600" :
    "text-gray-500";

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm mx-auto">
      <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
        {status !== "captured" ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
              autoPlay
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          </>
        ) : (
          capturedBase64 && (
            <img src={capturedBase64} className="w-full h-full object-cover" alt="Captura" />
          )
        )}

        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        )}
      </div>

      <canvas ref={captureRef} className="hidden" />

      <div className={`flex items-center gap-2 text-sm font-medium ${statusColor}`}>
        {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "error" && <AlertCircle className="h-4 w-4" />}
        {status === "captured" && matchResult && <CheckCircle className="h-4 w-4" />}
        <span>{statusMsg}</span>
      </div>

      {matchResult && status === "captured" && (
        <div className="w-full rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          <p className="font-semibold text-green-800">{matchResult.nomeCompleto}</p>
          <p className="text-green-700">#{matchResult.numeroInterno} · {matchResult.cargo}</p>
          <p className="text-xs text-green-600 mt-1">
            Confiança: {Math.round((1 - matchResult.distance) * 100)}%
          </p>
        </div>
      )}

      <div className="flex gap-2 w-full">
        {status !== "captured" ? (
          <>
            <Button
              onClick={handleCapture}
              disabled={status === "loading" || status === "error"}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Camera className="h-4 w-4 mr-2" />
              {mode === "enroll" ? "Cadastrar Rosto" : "Reconhecer"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFacingMode(f => f === "user" ? "environment" : "user")}
              title="Alternar câmera"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={handleReset} className="flex-1">
            <RotateCcw className="h-4 w-4 mr-2" />
            Tentar Novamente
          </Button>
        )}
      </div>
    </div>
  );
}
