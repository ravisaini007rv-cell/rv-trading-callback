/** Browser text-to-speech — free, offline, no API. */

let current: SpeechSynthesisUtterance | null = null;

export function ttsAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Strip markdown so the voice doesn't read asterisks and code. */
export function speakableText(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " (image) ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>#|-]{1,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function pickVoice(text: string) {
  const voices = speechSynthesis.getVoices();
  const hindi = /[\u0900-\u097F]/.test(text);
  return (
    voices.find((v) => (hindi ? v.lang.startsWith("hi") : v.lang === "en-IN")) ??
    voices.find((v) => v.lang.startsWith(hindi ? "hi" : "en")) ??
    voices[0]
  );
}

export function speak(md: string, onEnd?: () => void) {
  if (!ttsAvailable()) return;
  stopSpeaking();
  const text = speakableText(md);
  if (!text) return;

  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(text);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.rate = 1.02;
  u.pitch = 1;
  u.onend = () => {
    current = null;
    onEnd?.();
  };
  u.onerror = () => {
    current = null;
    onEnd?.();
  };
  current = u;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (!ttsAvailable()) return;
  speechSynthesis.cancel();
  current = null;
}

export function isSpeaking() {
  return ttsAvailable() && speechSynthesis.speaking && current !== null;
}
