/*{
  "DESCRIPTION": "Everything pulses in unison to a steady beat",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.8, 0.2, 1.0] },
    { "NAME": "bpm", "TYPE": "float", "MIN": 40.0, "MAX": 200.0, "DEFAULT": 120.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 0.95, "DEFAULT": 0.6 },
    { "NAME": "minBrightness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.15 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float beatsPerSec = bpm / 60.0;
  float phase = fract(TIME * beatsPerSec);

  float pulseWidth = clamp(1.0 - sharpness, 0.02, 0.98);
  float pulse = 1.0 - smoothstep(0.0, pulseWidth, phase);
  pulse = pulse * pulse;

  float bright = mix(minBrightness, 1.0, pulse);

  float side = step(0.5, uv.x);
  vec3 base = mix(colorA.rgb, colorB.rgb, side);

  vec3 col = base * bright;

  gl_FragColor = vec4(col, 1.0);
}
