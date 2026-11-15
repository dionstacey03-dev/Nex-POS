export type HapticPattern =
  | 'light'
  | 'medium'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection';

export type HapticIntensity = 'subtle' | 'balanced' | 'strong';

export interface HapticPreferences {
  enabled: boolean;
  intensity: HapticIntensity;
  audioFallback: boolean;
}

export interface HapticCapability {
  supportsVibrationApi: boolean;
  hasTouchHardware: boolean;
  status: 'supported' | 'limited' | 'unsupported';
  label: string;
  detail: string;
}

export interface HapticTriggerResult {
  vibrated: boolean;
  audioPlayed: boolean;
  pattern: HapticPattern;
  reason?: string;
}

const STORAGE_KEY = 'nexpos_haptic_preferences';

const DEFAULT_PREFERENCES: HapticPreferences = {
  enabled: true,
  intensity: 'balanced',
  audioFallback: false,
};

const BASE_PATTERNS: Record<HapticPattern, number[]> = {
  selection: [8],
  light: [12],
  medium: [22],
  success: [14, 45, 24],
  warning: [26, 42, 26],
  error: [42, 40, 42],
};

const INTENSITY_MULTIPLIERS: Record<HapticIntensity, number> = {
  subtle: 0.65,
  balanced: 1,
  strong: 1.4,
};

const GLOBAL_COOLDOWN_MS = 55;
const SAME_PATTERN_COOLDOWN_MS = 85;

let lastGlobalTriggerAt = 0;
const lastPatternTriggerAt: Partial<Record<HapticPattern, number>> = {};
let cachedAudioCtx: AudioContext | null = null;
const listeners = new Set<(prefs: HapticPreferences) => void>();

function readStoredPreferences(): HapticPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<HapticPreferences>;
    const intensity: HapticIntensity =
      parsed.intensity === 'subtle' ||
      parsed.intensity === 'balanced' ||
      parsed.intensity === 'strong'
        ? parsed.intensity
        : DEFAULT_PREFERENCES.intensity;
    return {
      enabled:
        typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : DEFAULT_PREFERENCES.enabled,
      intensity,
      audioFallback:
        typeof parsed.audioFallback === 'boolean'
          ? parsed.audioFallback
          : DEFAULT_PREFERENCES.audioFallback,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

let currentPreferences: HapticPreferences = readStoredPreferences();

export function getHapticPreferences(): HapticPreferences {
  return { ...currentPreferences };
}

export function setHapticPreferences(
  updates: Partial<HapticPreferences>
): HapticPreferences {
  currentPreferences = {
    ...currentPreferences,
    ...updates,
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(currentPreferences)
      );
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
  listeners.forEach((cb) => cb(getHapticPreferences()));
  return getHapticPreferences();
}

export function subscribeHapticPreferences(
  listener: (prefs: HapticPreferences) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHapticCapability(): HapticCapability {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supportsVibrationApi: false,
      hasTouchHardware: false,
      status: 'unsupported',
      label: 'Unavailable',
      detail: 'Running outside a browser environment.',
    };
  }

  const supportsVibrationApi = typeof navigator.vibrate === 'function';
  const coarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const hasTouchHardware =
    (navigator.maxTouchPoints ?? 0) > 0 || coarsePointer;

  if (!supportsVibrationApi) {
    return {
      supportsVibrationApi: false,
      hasTouchHardware,
      status: 'unsupported',
      label: 'Vibration API Unavailable',
      detail:
        'This browser does not expose the Web Vibration API. Visual feedback remains active, and optional subtle audio cues can be enabled.',
    };
  }

  if (!hasTouchHardware) {
    return {
      supportsVibrationApi: true,
      hasTouchHardware: false,
      status: 'limited',
      label: 'Desktop Environment',
      detail:
        'Browser supports the Web Vibration API, though most desktop devices do not include physical haptic motors.',
    };
  }

  return {
    supportsVibrationApi: true,
    hasTouchHardware: true,
    status: 'supported',
    label: 'Haptics Supported',
    detail: 'Touchscreen device with Web Vibration API support detected.',
  };
}

function scalePattern(
  pattern: HapticPattern,
  intensity: HapticIntensity
): number[] {
  const base = BASE_PATTERNS[pattern];
  const mult = INTENSITY_MULTIPLIERS[intensity];
  return base.map((ms, idx) => {
    // Preserve pause intervals (odd indices), scale active pulse durations (even indices)
    if (idx % 2 === 1) return ms;
    return Math.min(80, Math.max(5, Math.round(ms * mult)));
  });
}

function playSubtleAudioCue(
  pattern: HapticPattern,
  intensity: HapticIntensity
): boolean {
  if (typeof window === 'undefined') return false;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return false;

  try {
    if (!cachedAudioCtx) {
      cachedAudioCtx = new AudioCtx();
    }
    if (cachedAudioCtx.state === 'suspended') {
      void cachedAudioCtx.resume();
    }

    const ctx = cachedAudioCtx;
    const now = ctx.currentTime;
    const gainLevel =
      intensity === 'subtle' ? 0.02 : intensity === 'strong' ? 0.05 : 0.032;

    const scheduleTone = (
      freq: number,
      startOffset: number,
      durationSec: number
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(
        gainLevel,
        now + startOffset + 0.008
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + startOffset + durationSec
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + durationSec + 0.01);
    };

    switch (pattern) {
      case 'selection':
        scheduleTone(520, 0, 0.03);
        break;
      case 'light':
        scheduleTone(440, 0, 0.035);
        break;
      case 'medium':
        scheduleTone(360, 0, 0.05);
        break;
      case 'success':
        scheduleTone(523.25, 0, 0.06);
        scheduleTone(659.25, 0.065, 0.08);
        break;
      case 'warning':
        scheduleTone(330, 0, 0.06);
        scheduleTone(290, 0.08, 0.07);
        break;
      case 'error':
        scheduleTone(220, 0, 0.07);
        scheduleTone(180, 0.09, 0.09);
        break;
    }
    return true;
  } catch {
    return false;
  }
}

export function triggerHaptic(
  pattern: HapticPattern,
  options?: { bypassCooldown?: boolean; force?: boolean }
): HapticTriggerResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { vibrated: false, audioPlayed: false, pattern, reason: 'no-window' };
  }

  if (document.visibilityState === 'hidden') {
    return { vibrated: false, audioPlayed: false, pattern, reason: 'hidden' };
  }

  const prefs = currentPreferences;
  if (!prefs.enabled && !options?.force) {
    return { vibrated: false, audioPlayed: false, pattern, reason: 'disabled' };
  }

  const now = performance.now ? performance.now() : Date.now();
  if (!options?.bypassCooldown) {
    const isHighPriority = pattern === 'success' || pattern === 'error';
    if (!isHighPriority && now - lastGlobalTriggerAt < GLOBAL_COOLDOWN_MS) {
      return {
        vibrated: false,
        audioPlayed: false,
        pattern,
        reason: 'throttled',
      };
    }
    const prevPatternAt = lastPatternTriggerAt[pattern] ?? 0;
    if (now - prevPatternAt < SAME_PATTERN_COOLDOWN_MS) {
      return {
        vibrated: false,
        audioPlayed: false,
        pattern,
        reason: 'debounced',
      };
    }
  }

  lastGlobalTriggerAt = now;
  lastPatternTriggerAt[pattern] = now;

  let vibrated = false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      const sequence = scalePattern(pattern, prefs.intensity);
      vibrated = Boolean(navigator.vibrate(sequence));
    } catch {
      vibrated = false;
    }
  }

  let audioPlayed = false;
  if (prefs.audioFallback) {
    audioPlayed = playSubtleAudioCue(pattern, prefs.intensity);
  }

  return { vibrated, audioPlayed, pattern };
}

export const haptics = {
  light: (options?: { bypassCooldown?: boolean }) =>
    triggerHaptic('light', options),
  medium: (options?: { bypassCooldown?: boolean }) =>
    triggerHaptic('medium', options),
  success: (options?: { bypassCooldown?: boolean }) =>
    triggerHaptic('success', options),
  warning: (options?: { bypassCooldown?: boolean }) =>
    triggerHaptic('warning', options),
  error: (options?: { bypassCooldown?: boolean }) =>
    triggerHaptic('error', options),
  selection: (options?: { bypassCooldown?: boolean }) =>
    triggerHaptic('selection', options),
  trigger: triggerHaptic,
  getPreferences: getHapticPreferences,
  setPreferences: setHapticPreferences,
  subscribe: subscribeHapticPreferences,
  getCapability: getHapticCapability,
};
