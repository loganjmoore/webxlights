/*{
  "DESCRIPTION": "Everything pulses in bright bands to a steady beat",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.8, 0.2, 1.0] },
    { "NAME": "bpm", "TYPE": "float", "MIN": 40.0, "MAX": 200.0, "DEFAULT": 120.0 },
    { "NAME": "bands", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 },
    { "NAME": "punch", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float beatsPerSec = bpm / 60.0;
  float phase = fract(TIME * beatsPerSec);

  float pulse = pow(1.0 - phase, 3.0 + punch * 5.0);
  pulse = clamp(pulse, 0.0, 1.0);

  float axis = (RENDERSIZE.y < 2.0) ? uv.x : uv.x;
  float bandPos = fract(axis * bands);
  float bandShape = step(0.5, bandPos);

  vec3 base = mix(colorA.rgb, colorB.rgb, bandShape);

  float glow = mix(0.35, 1.0, pulse);
  vec3 col = base * glow;

  col += vec3(pulse * 0.25);

  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
