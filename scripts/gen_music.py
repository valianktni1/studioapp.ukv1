import wave, math, struct
import numpy as np

SR = 22050

def note(freq, dur, amp=0.3, detune=0.004):
    t = np.linspace(0, dur, int(SR * dur), False)
    # warm pad: fundamental + soft harmonics + slight detune, gentle vibrato
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5 * t)
    wave_ = np.zeros_like(t)
    for h, a in [(1, 1.0), (2, 0.45), (3, 0.22), (4, 0.1)]:
        wave_ += a * np.sin(2 * np.pi * freq * h * vib * t)
        wave_ += a * 0.5 * np.sin(2 * np.pi * freq * h * (1 + detune) * t)
    # soft attack/release envelope
    env = np.ones_like(t)
    a_n = int(0.25 * SR); r_n = int(0.6 * SR)
    env[:a_n] = np.linspace(0, 1, a_n)
    env[-r_n:] = np.linspace(1, 0, r_n)
    return amp * env * wave_ / 3.0

def chord(freqs, dur, amp=0.3):
    mix = np.zeros(int(SR * dur))
    for f in freqs:
        s = note(f, dur, amp)
        mix[:len(s)] += s
    return mix / max(1, len(freqs) ** 0.5)

def build(progression, bar=4.0, amp=0.3, shimmer=0.0):
    parts = [chord(c, bar, amp) for c in progression]
    audio = np.concatenate(parts)
    if shimmer:
        t = np.linspace(0, len(audio) / SR, len(audio), False)
        audio += shimmer * np.sin(2 * np.pi * 1760 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.15 * t))
    # simple reverb (feedback delay)
    delay = int(0.09 * SR)
    rev = np.copy(audio)
    for d, g in [(delay, 0.3), (delay * 2, 0.18), (delay * 3, 0.1)]:
        rev[d:] += g * audio[:-d]
    audio = 0.7 * audio + 0.3 * rev
    # normalise
    audio = audio / (np.max(np.abs(audio)) + 1e-6) * 0.85
    return audio

def freqs(*names):
    base = {"C3":130.81,"D3":146.83,"E3":164.81,"F3":174.61,"G3":196.0,"A3":220.0,"B3":246.94,
            "C4":261.63,"D4":293.66,"E4":329.63,"F4":349.23,"G4":392.0,"A4":440.0,"B4":493.88,
            "C5":523.25,"E5":659.25,"G5":783.99}
    return [base[n] for n in names]

def save(path, audio):
    data = (audio * 32767).astype(np.int16)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(data.tobytes())
    print("wrote", path, round(len(data)/SR,1), "s")

OUT = "/app/frontend/public/music"
import os; os.makedirs(OUT, exist_ok=True)

# Romantic — soft, tender (C - Am - F - G)
save(f"{OUT}/romantic.wav", build([
    freqs("C3","E3","G3","C4"), freqs("A3","C4","E4","A4"),
    freqs("F3","A3","C4","F4"), freqs("G3","B3","D4","G4"),
], bar=4.0, amp=0.32))

# Cinematic — grand, sweeping (Am - F - C - G) fuller, octaves
save(f"{OUT}/cinematic.wav", build([
    freqs("A3","C4","E4","A4","E5"), freqs("F3","A3","C4","F4","C5"),
    freqs("C3","G3","C4","E4","G4"), freqs("G3","B3","D4","G4","D4"),
], bar=4.5, amp=0.34, shimmer=0.03))

# Eternity — dreamy, gentle (C - G - Am - F) with high shimmer
save(f"{OUT}/eternity.wav", build([
    freqs("C4","E4","G4","C5"), freqs("G3","B3","D4","G4"),
    freqs("A3","C4","E4","A4"), freqs("F3","A3","C4","F4"),
], bar=5.0, amp=0.3, shimmer=0.045))
print("done")
