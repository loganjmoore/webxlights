/*{
  "DESCRIPTION": "A halftone dot pattern where the dots swell and shrink in waves across the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.6, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.1, 0.5, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "dotSize", "TYPE": "float", "MIN": 3.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  vec2 px = uv * RENDERSIZE;
  float t = mod(TIME * speed, 62.831853);
  float scale = max(1.0, min(RENDERSIZE.x, max(RENDERSIZE.y, 1.0)) / 32.0);
  float cellPx = dotSize * scale;
  vec2 cell = floor(px / cellPx);
  vec2 local = (px - (cell + 0.5) * cellPx) / cellPx;
  if (isLine) local.y = 0.0;
  // The wave: dot size follows a slow diagonal sine, so the swelling rolls across the display.
  float wave = 0.5 + 0.5 * sin((cell.x + cell.y) * 0.9 - t * 1.5);
  float radius = 0.12 + 0.42 * wave;
  float aa = (isLine ? 1.6 : 0.6) / cellPx;
  float dot = smoothstep(radius + aa, radius - aa, length(local));
  // Dots in the first colour on a deep field of the second; the field is dim but present.
  vec3 col = mix(colorB.rgb * 0.5, colorA.rgb, dot);
  gl_FragColor = vec4(col, 1.0);
}
