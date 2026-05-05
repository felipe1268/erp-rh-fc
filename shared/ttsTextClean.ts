/**
 * Limpa markdown, emojis e símbolos de um texto antes de enviá-lo a um motor TTS.
 * Sem isso, a voz lê literalmente "asterisco asterisco" ou descrições de emoji,
 * resultando em fala robótica e estranha. Compartilhado entre o servidor (Google
 * Cloud TTS) e o cliente (fallback via window.speechSynthesis).
 */
export function stripForTTS(s: string): string {
  if (!s) return "";
  return s
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*(\d+)\.\s+/gm, "$1, ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/^\s*>\s+/gm, "")
    .replace(/^\|.*\|$/gm, (line) => line.replace(/\|/g, " ").replace(/[-:]{3,}/g, ""))
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{1F000}-\u{1F2FF}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/\u{FE0F}/gu, "")
    .replace(/[•●○▪▫■□◆◇★☆✓✗→←↑↓↔↕]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .trim();
}
