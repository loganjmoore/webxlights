/*{
  "DESCRIPTION": "Everything pulses in bright bands to a steady beat",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.8, 0.2, 1.0] },
    { "NAME": "bpm", "TYPE": "float", "MIN": 40.0, "MAX": 200.0, "DEFAULT": 120.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 1.0, "MAX": 16.0, "DEFAULT": 6.0 },
    { "NAME": "bands", "TYPE": "long", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float beatsPerSec = bpm / 60.0;
  float phase = fract(TIME * beatsPerSec);

  // Sharp pulse: near 1.0 right on the beat, decaying quickly
  float pulse = pow(1.0 - phase, sharpness);
  pulse = clamp(pulse, 0.0, 1.0);

  // Split canvas into bands so it reads as a pattern even on thin strips
  float n = float(bands);
  float coord = (RENDERSIZE.y < 2.0) ? uv.x : uv.x;
  float bandIndex = floor(coord * n);
  float bandFrac = fract(bandIndex * 0.5);
  float colorMix = step(0.5, bandFrac);

  vec3 baseColor = mix(colorA.rgb, colorB.rgb, colorMix);

  // Pulse brightness: dim base glow plus bright flash on the beat
  float brightness = mix(0.25, 1.0, pulse);

  vec3 finalColor = baseColor * brightness;

  gl_FragColor = vec4(finalColor, 1.0);
}
