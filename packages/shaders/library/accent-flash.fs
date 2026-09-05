/*{
  "DESCRIPTION": "A calm base colour with a bright accent flashing across it every couple of seconds",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.2, 0.9, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.05, "MAX": 0.4, "DEFAULT": 0.15 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // 100 * 0.5 is whole: one flash every two seconds at speed 1, wrapping cleanly.
  float t = mod(TIME * speed, 100.0) * 0.5;
  float d = isLine ? uv.x : (uv.x * aspect + uv.y) / (aspect + 1.0);
  // The accent is a soft bar that crosses the whole display in the first half of each cycle
  // and is gone for the second half - the calm is the point.
  float phase = fract(t);
  float pos = phase * 2.4 - 0.7;
  float bar = smoothstep(width, 0.0, abs(d - pos)) * step(phase, 0.5);
  // The base breathes very slightly, so the calm is alive rather than a still image.
  float breathe = 0.8 + 0.2 * sin(mod(TIME * speed, 62.831853) * 0.5 + d * 2.0);
  vec3 col = colorA.rgb * breathe;
  col = mix(col, colorB.rgb, bar);
  gl_FragColor = vec4(col, 1.0);
}
