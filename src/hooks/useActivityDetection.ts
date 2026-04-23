import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import Webcam from 'react-webcam';

// How long each distraction signal must persist before triggering (ms)
const PHONE_DELAY_MS      = 0;     // Immediate — no tolerance for phones
const AWAY_DELAY_MS       = 8000;  // 8s missing before "Away from Desk"
const LOOK_AWAY_DELAY_MS  = 4000;  // 4s of head-turn before "Looking Away"
const DROWSY_DELAY_MS     = 6000;  // 6s of low face confidence before "Drowsy"
const MULTIPERSON_DELAY_MS = 3000; // 3s of second face before "Visitor Detected"
const SPEAKER_DELAY_MS    = 3000;  // 3s of speech without lip movement before "Speaker Detected"

// BlazeFace landmark indices
const RIGHT_EYE = 0;
const LEFT_EYE  = 1;
const NOSE      = 2;
const MOUTH     = 3;
// const RIGHT_EAR = 4;
// const LEFT_EAR  = 5;

export function useActivityDetection(enabled: boolean, isNoisy: boolean = false, isSpeechDetected: boolean = false, awayTimeoutMs = AWAY_DELAY_MS) {
  const webcamRef    = useRef<Webcam>(null);
  const cocoModelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const faceModelRef = useRef<blazeface.BlazeFaceModel | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const [isDistracted,    setIsDistracted]    = useState(false);
  const [distractionReason, setDistractionReason] = useState<string | null>(null);

  // Separate start-time refs for each distraction signal
  const missingPersonStartRef  = useRef<number | null>(null);
  const lookingAwayStartRef    = useRef<number | null>(null);
  const drowsyStartRef         = useRef<number | null>(null);
  const multiPersonStartRef    = useRef<number | null>(null);
  const speakerDistractionStartRef = useRef<number | null>(null);

  // Low-confidence streak counter for drowsiness
  const lowConfidenceStreakRef  = useRef(0);
  
  // Rolling buffer for mouth movement
  const mouthRatioBufferRef = useRef<number[]>([]);

  // ── Model loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const loadModel = async () => {
      try {
        await tf.ready();
        const [cocoModel, faceModel] = await Promise.all([
          cocoSsd.load({ base: 'mobilenet_v2' }),
          blazeface.load(),
        ]);
        if (active) {
          cocoModelRef.current = cocoModel;
          faceModelRef.current = faceModel;
          setIsModelLoaded(true);
          console.log('COCO-SSD and BlazeFace models loaded');
        }
      } catch (err) {
        console.error('Failed to load AI models:', err);
      }
    };

    if (enabled && !isModelLoaded) loadModel();
    return () => { active = false; };
  }, [enabled, isModelLoaded]);

  // ── Detection loop ───────────────────────────────────────────────────────────
  const detect = useCallback(async () => {
    if (
      !enabled ||
      !cocoModelRef.current ||
      !faceModelRef.current ||
      !webcamRef.current?.video ||
      webcamRef.current.video.readyState !== 4
    ) return;

    try {
      const video = webcamRef.current.video;
      const now   = Date.now();

      const [cocoPredictions, faces] = await Promise.all([
        cocoModelRef.current.detect(video, 40, 0.1),
        faceModelRef.current.estimateFaces(video, false),
      ]);

      // ── 1. COCO-SSD: body / phone presence ──────────────────────────────────
      let personDetected = false;
      let phoneDetected  = false;

      cocoPredictions.forEach(p => {
        if (p.class === 'person'     && p.score > 0.15) personDetected = true;
        // Increased from 0.35 to 0.60 — COCO-SSD often mistakes hands for phones
        if (p.class === 'cell phone' && p.score > 0.60) phoneDetected  = true;
      });

      // ── 2. BlazeFace: rich face-level signals ────────────────────────────────
      const primaryFace = faces[0] ?? null;
      
      // Filter out low-confidence faces (like posters or background objects)
      let validFaceCount = 0;
      faces.forEach(f => {
        const prob = Array.isArray(f.probability) ? (f.probability as number[])[0] : (f.probability as unknown as number);
        const topLeft = f.topLeft as [number, number];
        const bottomRight = f.bottomRight as [number, number];
        const faceWidth = bottomRight[0] - topLeft[0];
        
        // Require extremely high confidence (>0.95) and minimum size to be counted as a visitor
        if (prob > 0.95 && faceWidth > 30) validFaceCount++;
      });
      const multipleDetected = validFaceCount > 1;

      let lookingAway  = false;
      let isDrowsy     = false;
      let facePresent  = false;
      let isMouthMoving = false;

      if (primaryFace) {
        personDetected = true;
        facePresent    = true;

        const topLeft     = primaryFace.topLeft     as [number, number];
        const bottomRight = primaryFace.bottomRight as [number, number];
        const faceWidth   = bottomRight[0] - topLeft[0];
        const faceHeight  = bottomRight[1] - topLeft[1];
        const landmarks   = primaryFace.landmarks   as number[][];

        // ── 2a. Liveness (Mouth Movement) ───────────────────────────────────
        const noseY  = landmarks[NOSE]?.[1] ?? 0;
        const mouthY = landmarks[MOUTH]?.[1] ?? 0;
        const mouthRatio = faceHeight > 0 ? Math.abs(mouthY - noseY) / faceHeight : 0;
        
        mouthRatioBufferRef.current.push(mouthRatio);
        if (mouthRatioBufferRef.current.length > 8) mouthRatioBufferRef.current.shift();
        
        if (mouthRatioBufferRef.current.length >= 4) {
          const maxRatio = Math.max(...mouthRatioBufferRef.current);
          const minRatio = Math.min(...mouthRatioBufferRef.current);
          isMouthMoving = (maxRatio - minRatio) > 0.015;
        }

        // ── 2a. Gaze / head-turn detection ──────────────────────────────────
        // Eye horizontal span relative to face width.
        // Straight-on: ~0.35–0.50. Turned sideways: < 0.22.
        const rightEyeX  = landmarks[RIGHT_EYE]?.[0] ?? 0;
        const leftEyeX   = landmarks[LEFT_EYE]?.[0]  ?? 0;
        const noseX      = landmarks[NOSE]?.[0]       ?? (topLeft[0] + faceWidth / 2);
        const eyeSpanX   = Math.abs(rightEyeX - leftEyeX);
        const eyeRatio   = faceWidth > 0 ? eyeSpanX / faceWidth : 1;

        // Also check nose symmetry: nose should sit near horizontal centre
        const faceCentreX  = topLeft[0] + faceWidth / 2;
        const noseOffsetRatio = Math.abs(noseX - faceCentreX) / faceWidth;

        // Head significantly turned (relaxed thresholds to reduce false positives)
        lookingAway = eyeRatio < 0.18 || noseOffsetRatio > 0.35;

        // ── 2b. Drowsiness detection ─────────────────────────────────────────
        // BlazeFace probability drops when eyes close (less distinctive facial features)
        const faceConfidence = Array.isArray(primaryFace.probability)
          ? (primaryFace.probability as number[])[0]
          : (primaryFace.probability as unknown as number);

        // Lowered threshold from 0.55 to 0.40 to prevent bad lighting from triggering it
        if (faceConfidence !== undefined && faceConfidence < 0.40) {
          lowConfidenceStreakRef.current += 1;
        } else {
          lowConfidenceStreakRef.current = 0;
        }
        // Require 10 consecutive low-confidence frames (~4s at 400ms interval)
        isDrowsy = lowConfidenceStreakRef.current >= 10;
      } else {
        lowConfidenceStreakRef.current = 0;
        mouthRatioBufferRef.current = [];
      }

      // ── 3. Priority-ordered distraction state machine ────────────────────────
      // Priority: Phone > Multiple People > Speaker/Video > Looking Away > Drowsy > Away from Desk
      // Each non-zero-delay signal uses its own start ref for independent grace periods.

      // ── 3a. Phone — immediate ────────────────────────────────────────────────
      if (phoneDetected) {
        missingPersonStartRef.current = null;
        lookingAwayStartRef.current   = null;
        drowsyStartRef.current        = null;
        multiPersonStartRef.current   = null;
        speakerDistractionStartRef.current = null;
        setIsDistracted(true);
        setDistractionReason('📱 Phone Detected');
        return;
      }

      // ── 3b. Multiple people in frame ─────────────────────────────────────────
      if (multipleDetected) {
        if (multiPersonStartRef.current === null) {
          multiPersonStartRef.current = Date.now();
        } else if (Date.now() - multiPersonStartRef.current > MULTIPERSON_DELAY_MS) {
          setIsDistracted(true);
          setDistractionReason('👥 Visitor Detected');
          return;
        }
      } else {
        multiPersonStartRef.current = null;
      }

      // ── 3c. Speaker / Video (Speech detected but no lip movement) ────────────
      if (isSpeechDetected && !isMouthMoving && facePresent) {
        if (speakerDistractionStartRef.current === null) {
          speakerDistractionStartRef.current = Date.now();
        } else if (Date.now() - speakerDistractionStartRef.current > SPEAKER_DELAY_MS) {
          setIsDistracted(true);
          setDistractionReason('🔊 Speaker/Video Detected');
          return;
        }
      } else {
        speakerDistractionStartRef.current = null;
      }

      // ── 3d. Looking away (head turned) ───────────────────────────────────────
      if (lookingAway && facePresent) {
        if (lookingAwayStartRef.current === null) {
          lookingAwayStartRef.current = Date.now();
        } else if (Date.now() - lookingAwayStartRef.current > LOOK_AWAY_DELAY_MS) {
          setIsDistracted(true);
          setDistractionReason('👀 Looking Away');
          return;
        }
      } else {
        lookingAwayStartRef.current = null;
      }

      // ── 3d. Drowsiness (eyes closing / nodding off) ──────────────────────────
      if (isDrowsy && facePresent) {
        if (drowsyStartRef.current === null) {
          drowsyStartRef.current = Date.now();
        } else if (Date.now() - drowsyStartRef.current > DROWSY_DELAY_MS) {
          setIsDistracted(true);
          setDistractionReason('😴 Falling Asleep');
          return;
        }
      } else {
        drowsyStartRef.current = null;
      }

      // ── 3e. Face not visible / Away from desk ──────────────────────────────
      if (!facePresent) {
        if (isNoisy) {
          // Typing/writing sounds — assume still studying even if face is hidden
          missingPersonStartRef.current = null;
          setIsDistracted(false);
          setDistractionReason(null);
        } else if (missingPersonStartRef.current === null) {
          missingPersonStartRef.current = Date.now();
          setIsDistracted(false);
          setDistractionReason(null);
        } else if (Date.now() - missingPersonStartRef.current > awayTimeoutMs) {
          setIsDistracted(true);
          setDistractionReason(personDetected ? '👤 Face Not Visible' : '🚶 Away from Desk');
        } else {
          setIsDistracted(false);
          setDistractionReason(null);
        }
        return;
      }

      // ── 3f. All clear — person present and not distracted ────────────────────
      missingPersonStartRef.current = null;
      setIsDistracted(false);
      setDistractionReason(null);

    } catch (err) {
      console.warn('Detection error:', err);
    }
  }, [enabled, isNoisy, awayTimeoutMs]);

  // ── Detection interval ───────────────────────────────────────────────────────
  useEffect(() => {
    let timeoutId: number;
    let active = true;

    const loop = async () => {
      if (enabled && isModelLoaded) await detect();
      if (active) timeoutId = window.setTimeout(loop, 400);
    };

    if (enabled && isModelLoaded) {
      loop();
    } else {
      setIsDistracted(false);
      setDistractionReason(null);
      missingPersonStartRef.current = null;
      lookingAwayStartRef.current   = null;
      drowsyStartRef.current        = null;
      multiPersonStartRef.current   = null;
      speakerDistractionStartRef.current = null;
      lowConfidenceStreakRef.current = 0;
      mouthRatioBufferRef.current = [];
    }

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, isModelLoaded, detect]);

  return { webcamRef, isModelLoaded, isDistracted, distractionReason };
}
