/*{
  "DESCRIPTION": "A deep red heartbeat pulsing twice then resting, over and over",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.05, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "rest", "TYPE": "float", "MIN": 0.1, "MAX": 0.6, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // 100 * 0.5 is whole: one beat cycle every two seconds at speed 1, wrapping cleanly.
  // Offset so the very first frame lands on a beat rather than on the rest.
  float phase = fract(mod(TIME * speed, 100.0) * 0.5 + 0.12);
  // Two beats close together, the second a little softer, then the rest of the cycle quiet.
  float b1 = pow(max(0.0, 1.0 - abs(phase - 0.12) * 9.0), 2.0);
  float b2 = pow(max(0.0, 1.0 - abs(phase - 0.32) * 9.0), 2.0) * 0.8;
  float beat = max(b1, b2);
  // The resting glow is what keeps it from ever reading as off.
  float env = rest + (1.0 - rest) * beat;
  // Brighter at the centre, and the beat swells outward.
  float d = isLine ? abs(uv.x - 0.5) * 2.0 : length(p) / 0.72;
  float swell = 1.0 - smoothstep(0.0, 1.0, d) * (0.5 - 0.3 * beat);
  gl_FragColor = vec4(colorA.rgb * env * swell, 1.0);
}
