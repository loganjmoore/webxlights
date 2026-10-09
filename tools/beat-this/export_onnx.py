"""Exports Beat This! (CPJKU, MIT: https://github.com/CPJKU/beat_this) to ONNX for the browser.

Magic Sequence's "pro" analysis runs this model in a Web Worker with onnxruntime-web
(apps/web/src/lib/magic/beatThisModel.ts, with the DSP around it in
packages/engine/src/song/beatThis.ts). The committed model and test fixture come from this script:

    python -m venv .venv && .venv/bin/pip install torch torchaudio onnx onnxruntime \\
        einops rotary-embedding-torch soxr soundfile "git+https://github.com/CPJKU/beat_this.git"
    .venv/bin/python tools/beat-this/export_onnx.py

It downloads the official "small0" checkpoint, exports it with a dynamic time axis, checks ONNX
Runtime against PyTorch at several lengths, and writes:
  apps/web/public/models/beat-this-small0.onnx   the model
  packages/engine/test/fixtures/beat-this-parity.json   a synthetic signal's log-mel frames, logits and
                                                 beats from the reference Python pipeline, which
                                                 the TypeScript port is tested against
"""

import json
import math
import os

import numpy as np
import onnxruntime as ort
import torch
from beat_this.inference import Spect2Frames, load_model
from beat_this.model.postprocessor import Postprocessor
from beat_this.preprocessing import LogMelSpect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_OUT = os.path.join(REPO, "apps", "web", "public", "models", "beat-this-small0.onnx")
FIXTURE_OUT = os.path.join(REPO, "packages", "engine", "test", "fixtures", "beat-this-parity.json")
CHECKPOINT = "small0"


class Wrapped(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, spect):
        out = self.model(spect)
        return out["beat"], out["downbeat"]


def test_signal(seconds=40.0, sr=22050, bpm=120.0):
    """The same formula as the TypeScript test: a kick on every beat, a hat on every half beat,
    a louder kick on each bar's first beat, and a soft chord underneath."""
    n = int(seconds * sr)
    t = np.arange(n, dtype=np.float64) / sr
    beat = 60.0 / bpm
    x = 0.08 * (np.sin(2 * np.pi * 220 * t) + np.sin(2 * np.pi * 277.18 * t) + np.sin(2 * np.pi * 329.63 * t))
    phase = np.mod(t, beat)
    bar_start = np.mod(np.floor(t / beat), 4) == 0
    kick_env = np.exp(-phase / 0.05) * np.where(bar_start, 1.0, 0.7)
    x += kick_env * np.sin(2 * np.pi * 55 * phase * (1 + 2 * np.exp(-phase / 0.02)))
    half = np.mod(t, beat / 2)
    x += 0.15 * np.exp(-half / 0.01) * np.sin(2 * np.pi * 7000 * t)
    return (x / np.max(np.abs(x)) * 0.9).astype(np.float32)


def main():
    model = load_model(CHECKPOINT, "cpu").eval()
    wrapped = Wrapped(model).eval()

    os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
    dummy = torch.randn(1, 1500, 128)
    torch.onnx.export(
        wrapped, (dummy,), MODEL_OUT,
        input_names=["spect"], output_names=["beat", "downbeat"],
        dynamic_axes={"spect": {1: "time"}, "beat": {1: "time"}, "downbeat": {1: "time"}},
        opset_version=17, dynamo=False,
    )
    session = ort.InferenceSession(MODEL_OUT, providers=["CPUExecutionProvider"])

    # Parity at the chunk length the browser uses and at shorter pieces (a song under 30 s is one
    # shorter chunk).
    worst = 0.0
    for frames in (1500, 1012, 640):
        x = torch.randn(1, frames, 128) * 2 + 3
        with torch.inference_mode():
            ref_beat, ref_down = wrapped(x)
        beat, down = session.run(None, {"spect": x.numpy()})
        worst = max(worst, float(np.max(np.abs(beat - ref_beat.numpy()))), float(np.max(np.abs(down - ref_down.numpy()))))
    print(f"onnx vs torch, max abs logit difference: {worst:.2e}")
    assert worst < 1e-3, worst

    # The reference pipeline on a synthetic signal, for the TypeScript port's tests.
    signal = test_signal()
    spect = LogMelSpect()(torch.from_numpy(signal))
    beat_logits, down_logits = Spect2Frames(CHECKPOINT, "cpu")(spect)
    beats, downbeats = Postprocessor(type="minimal")(beat_logits, down_logits)
    fixture = {
        "source": f"tools/beat-this/export_onnx.py ({CHECKPOINT}, beat_this {getattr(__import__('beat_this'), '__version__', 'git')})",
        "signal": {"seconds": 40.0, "sampleRate": 22050, "bpm": 120.0},
        "frames": int(spect.shape[0]),
        # A few frames of the log-mel input, whole, to pin the front end.
        "melFrames": {str(i): [round(float(v), 5) for v in spect[i]] for i in (0, 1, 50, 437, 1000, spect.shape[0] - 1)},
        "beatLogits": [round(float(v), 4) for v in beat_logits],
        "downbeatLogits": [round(float(v), 4) for v in down_logits],
        "beats": [round(float(v), 4) for v in beats],
        "downbeats": [round(float(v), 4) for v in downbeats],
    }
    with open(FIXTURE_OUT, "w") as f:
        json.dump(fixture, f, separators=(",", ":"))
    print(f"wrote {MODEL_OUT} ({os.path.getsize(MODEL_OUT)} bytes) and {FIXTURE_OUT}")
    print(f"reference: {len(beats)} beats, {len(downbeats)} downbeats, first beats {list(beats[:5])}")


if __name__ == "__main__":
    main()
