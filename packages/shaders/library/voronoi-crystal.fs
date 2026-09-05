/*{
  "DESCRIPTION": "Crystal facets in a shifting cellular pattern, each cell lit differently, edges catching the light",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.3, 0.6, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.8, 0.3, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "cells", "TYPE": "float", "MIN": 2.0, "MAX": 6.0, "DEFAULT": 3.5 }
  ]
}*/
vec2 hash2(vec2 c) {
  return fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = uv * vec2(min(aspect, 3.0), 1.0) * cells;
  if (isLine) p.y = 0.5;
  float t = mod(TIME * speed, 62.831853);
  vec2 cell = floor(p);
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 id = cell;
  // The nearest and second-nearest seed among the neighbouring cells; each seed wanders in
  // its cell on its own slow circle, so the facets shift without ever jumping.
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 n = cell + vec2(float(i), float(j));
      vec2 h = hash2(n);
      vec2 seed = n + 0.5 + 0.35 * vec2(sin(t * 0.4 + h.x * 6.28), cos(t * 0.3 + h.y * 6.28));
      if (isLine) seed.y = 0.5;
      float d = length(p - seed);
      if (d < d1) { d2 = d1; d1 = d; id = n; }
      else if (d < d2) { d2 = d; }
    }
  }
  vec2 hid = hash2(id);
  // Each facet has its own colour and its own slow glint.
  vec3 col = hid.x < 0.5 ? colorA.rgb : colorB.rgb;
  float glint = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(t * 0.8 + hid.y * 6.28), 3.0);
  col *= glint;
  // The edges between facets catch the light.
  float edge = 1.0 - smoothstep(0.0, isLine ? 0.25 : 0.12, d2 - d1);
  col = mix(col, colorC.rgb, edge * 0.85);
  gl_FragColor = vec4(col, 1.0);
}
