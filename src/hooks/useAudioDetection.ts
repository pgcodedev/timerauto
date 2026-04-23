import { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as tfconv from '@tensorflow/tfjs-converter';

// Distracting YAMNet classes
// Removed 0 (Speech) and 63 (Chatter) because the user studies by speaking loudly.
// 132: Music, 267: Video game, 382: Alarm, 383: Telephone, 385: Ringtone, 518: Television
const DISTRACTING_CLASSES = new Set([132, 267, 382, 383, 385, 518]);

export function useAudioDetection(enabled: boolean, sensitivity = 15) {
  const [isNoisy, setIsNoisy] = useState(false); // Indicates studying noise (typing, writing)
  const [audioDistraction, setAudioDistraction] = useState<string | null>(null); // Indicates mobile/distracting sound
  const [isSpeechDetected, setIsSpeechDetected] = useState(false); // Indicates human speech (Class 0)
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<tfconv.GraphModel | null>(null);
  const [isAudioModelLoaded, setIsAudioModelLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loadModel = async () => {
      try {
        await tf.ready();
        // Load YAMNet
        const modelUrl = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';
        const model = await tfconv.loadGraphModel(modelUrl, { fromTFHub: true });
        if (active) {
          modelRef.current = model;
          setIsAudioModelLoaded(true);
          console.log('YAMNet audio classification model loaded');
        }
      } catch (err) {
        console.error('Failed to load YAMNet:', err);
      }
    };
    if (enabled && !isAudioModelLoaded) {
      loadModel();
    }
    return () => { active = false; };
  }, [enabled, isAudioModelLoaded]);

  useEffect(() => {
    if (!enabled || !isAudioModelLoaded) {
      setIsNoisy(false);
      setAudioDistraction(null);
      setIsSpeechDetected(false);
      return;
    }

    let active = true;
    let audioProcessor: ScriptProcessorNode | null = null;

    const startAudio = async () => {
      try {
        // YAMNet requires exactly 16000 Hz sample rate
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;
        
        const source = audioCtx.createMediaStreamSource(stream);
        
        // 16384 samples at 16kHz is ~1 second of audio
        const bufferSize = 16384; 
        audioProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
        
        source.connect(audioProcessor);
        audioProcessor.connect(audioCtx.destination);

        audioProcessor.onaudioprocess = async (e) => {
          if (!active || !modelRef.current) return;
          
          const channelData = e.inputBuffer.getChannelData(0);
          
          // Basic volume check for typing/writing (isNoisy)
          let sumVolume = 0;
          for (let i = 0; i < channelData.length; i++) {
            sumVolume += Math.abs(channelData[i]);
          }
          const avgVolume = sumVolume / channelData.length;
          setIsNoisy(avgVolume > (sensitivity / 1000)); 

          // Run YAMNet classification
          // Ensure we pass exactly what YAMNet expects: a 1D tensor of shape [frames]
          const waveform = tf.tensor1d(channelData);
          
          // predict() returns [scores, embeddings, spectrogram]
          try {
            const results = modelRef.current.predict(waveform) as tf.Tensor[];
            const scores = results[0]; 
            
            // YAMNet processes the 1s buffer into a few frames, we average them
            const meanScores = tf.mean(scores, 0); 
            const topClassTensor = tf.argMax(meanScores);
            const topClassIndex = (await topClassTensor.data())[0];
            const topScore = (await meanScores.data())[topClassIndex];
            const speechScore = (await meanScores.data())[0]; // Class 0 is Speech

            // Free tensors
            tf.dispose([waveform, ...results, meanScores, topClassTensor]);
            
            // Flag if speech is prominently detected
            setIsSpeechDetected(speechScore > 0.25);

            // Only trigger distraction if it's highly confident it's music/speech/phone
            if (DISTRACTING_CLASSES.has(topClassIndex) && topScore > 0.2) {
              let reason = "Audio Distraction";
              if (topClassIndex === 132 || topClassIndex === 267) reason = "Music/Media Detected";
              if (topClassIndex === 383 || topClassIndex === 385) reason = "Phone Sound Detected";
              if (topClassIndex === 518) reason = "Television Detected";
              setAudioDistraction(reason);
            } else {
              setAudioDistraction(null);
            }
          } catch (e) {
            console.error("YAMNet inference error:", e);
            tf.dispose(waveform);
          }
        };

      } catch (err) {
        console.error("Microphone access error:", err);
      }
    };

    startAudio();

    return () => {
      active = false;
      if (audioProcessor) audioProcessor.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [enabled, isAudioModelLoaded, sensitivity]);

  return { isNoisy, audioDistraction, isAudioModelLoaded, isSpeechDetected };
}
