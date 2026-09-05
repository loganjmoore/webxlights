/*{
  "DESCRIPTION": "A radar line sweeping around the display leaving a fading trail behind it",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 1.0, 0.3, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "trail", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // 20 pi: one revolution per 2 pi seconds at speed 1, wrapping on a whole turn.
  float t = mod(TIME * speed, 62.831853);
  float back;
  float edge;
  if (isLine) {
    // A line can't turn, so the sweep runs along it and starts again.
    float pos = fract(t / 6.2831853);
    back = fract(pos - uv.x);
    edge = smoothstep(0.05, 0.0, abs(uv.x - pos));
  } else {
    float a = atan(p.y, p.x);
    back = fract((t - a) / 6.2831853);
    edge = smoothstep(0.07, 0.0, min(back, 1.0 - back));
  }
  // The trail: bright just behind the line, fading round to nothing before the line comes back.
  float glow = pow(clamp(1.0 - back / trail, 0.0, 1.0), 2.5);
  // Faint range rings under everything, so the screen reads as a radar and not just a wedge.
  float r = length(p);
  float rings = isLine ? 0.0 : smoothstep(0.07, 0.0, abs(fract(r * 3.0 + 0.5) - 0.5)) * 0.35;
  vec3 col = colorA.rgb * (0.16 + rings + glow);
  col = mix(col, colorB.rgb, edge * 0.85);
  gl_FragColor = vec4(col, 1.0);
}
