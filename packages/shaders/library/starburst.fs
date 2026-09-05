/*{
  "DESCRIPTION": "Bright rays bursting outward from the centre and fading, one burst after another",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "rays", "TYPE": "float", "MIN": 4.0, "MAX": 16.0, "DEFAULT": 8.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // 100 * 0.25 is whole, so a burst never jumps when the clock wraps.
  float t = mod(TIME * speed, 100.0) + 1.2;
  float d = isLine ? abs(uv.x - 0.5) * 2.0 : length(p) / 0.72;
  float a = atan(p.y, p.x);
  // Rays: dark between them on a matrix; a line has no "between".
  float rayMask = isLine ? 1.0 : pow(abs(sin(a * rays * 0.5)), 1.8);
  // Two bursts half a cycle apart, so one is always on screen while the other is being born.
  float burst = 0.0;
  for (int i = 0; i < 2; i++) {
    float front = fract(t * 0.25 + float(i) * 0.5);
    float wave = smoothstep(front + 0.03, front - 0.03, d) * smoothstep(front - 0.4, front, d);
    burst = max(burst, wave);
  }
  // A constant hot centre, where every burst comes from.
  float core = smoothstep(0.28, 0.0, d);
  // The rays are faintly present all the time; the bursts light them up.
  vec3 col = colorA.rgb * (0.1 + 0.9 * burst) * rayMask;
  col = mix(col, colorB.rgb, core);
  gl_FragColor = vec4(col, 1.0);
}
