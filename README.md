<div align="center">
  
# 🧠 TimerAuto: The Ultimate AI Study Timer

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)
[![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**A privacy-first, purely on-device AI productivity tool that watches you study so you don't have to watch the clock.**

[Features](#-features) • [How It Works](#-how-it-works) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) 

</div>

---

## 🎯 What is TimerAuto?

**TimerAuto** is a next-generation study timer and productivity tracker that uses your webcam and microphone to ensure you stay focused. Unlike traditional Pomodoro timers where you manually click "start" and "pause", TimerAuto uses **local, in-browser AI** to monitor your presence and environment. 

If you pick up your phone, walk away from your desk, fall asleep, or start watching a video, the timer automatically pauses and logs the distraction. When you look back at your notes, it instantly resumes. 

**Zero data leaves your device. Everything runs locally in your browser.**

---

## ✨ Features

### 👁️ Ultimate Liveness & Vision Detection
*   **📱 Phone Detection:** Instantly flags if a smartphone enters the frame.
*   **😴 Drowsiness Tracking:** Tracks your facial features and flags if your eyes are closing or you're nodding off.
*   **👀 Gaze Detection:** Knows when you significantly turn your head away from your study materials.
*   **👥 Visitor Detection:** Pauses the timer if a second person enters the frame to talk to you.
*   **🚶 Presence Detection:** Automatically pauses when you leave your desk, ignoring computer idle timers if you're physically reading a book.

### 🎙️ Advanced Audio Sync
*   **🔊 Media & Music Detection:** Flags televisions, music, and phone ringing in the background.
*   **🗣️ Lip-Sync Analysis:** Pairs microphone audio with camera mouth-movement tracking. If speech is heard but your lips aren't moving, it flags a background video/speaker. If your lips *are* moving, it knows you are just studying out loud!

### 📊 Productivity Analytics
*   **Automatic Logging:** Tracks your total focused hours automatically.
*   **Distraction Auditing:** Keeps a log of exactly *why* you were distracted (e.g., "Phone Detected", "Looking Away", "Visitor") and for how long.

---

## 🔒 How It Works (Privacy First)

TimerAuto is built on the principle of absolute privacy.
1.  **No Cloud Processing:** All AI models run via WebGL directly on your machine's GPU using TensorFlow.js.
2.  **No Data Collection:** Your webcam feed and microphone audio are processed in real-time and immediately discarded in RAM. Nothing is recorded, saved, or transmitted to any server.
3.  **Local Storage:** Your study statistics and distraction logs are saved only to your browser's `localStorage`.

---

## 🛠️ Tech Stack

TimerAuto leverages the power of the modern web:

*   **Frontend:** React 18, TypeScript, Vite, CSS Modules
*   **AI Engine:** TensorFlow.js (`@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-webgl`)
*   **Vision Models:** 
    *   `COCO-SSD` (MobileNet v2) for robust object and body detection.
    *   `BlazeFace` for high-speed, lightweight facial landmark tracking.
*   **Audio Model:**
    *   `YAMNet` for 521-class environmental audio classification.

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+ recommended)
*   A modern web browser (Chrome, Edge, Brave, or Firefox)
*   A webcam and microphone

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/pgcodedev/timerauto.git
    cd timerauto
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Start the development server**
    ```bash
    npm run dev
    ```

4.  **Open your browser**
    Navigate to `http://localhost:5173` (or the port provided by Vite). Grant camera and microphone permissions when prompted to start studying!

---

## 💡 Usage Tips
*   **Lighting:** Ensure your face is well-lit for the most accurate tracking.
*   **Audio Sensitivity:** If you study in a naturally noisy environment, the microphone detection might be overly sensitive. You can toggle the microphone off and rely purely on the camera.

---

<div align="center">
  <i>Built to eliminate procrastination.</i>
</div>
