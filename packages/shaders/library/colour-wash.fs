/*{
  "DESCRIPTION": "The whole display washing slowly from one colour to the next, always bright",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.9, 0.2, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.1, 0.4, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sweep", "TYPE": "float", "MIN": 0.0, "MAX": 0.5, "DEFAULT": 0.15 }
  ]
}*/
vec3 pick(float i) {
  if (i < 0.5) return colorA.rgb;
  if (i < 1.5) return colorB.rgb;
  return colorC.rgb;
}
void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // 100 * 0.1 is whole, so the cycle never jumps when the clock wraps.
  float t = mod(TIME * speed, 100.0);
  // The wash sweeps diagonally across the display rather than switching everywhere at once.
  float d = (uv.x * aspect + uv.y) / (aspect + 1.0);
  float phase = fract(t * 0.1 - d * sweep) * 3.0;
  float idx = floor(phase);
  float next = mod(idx + 1.0, 3.0);
  // Each colour holds for most of its third, then crosses to the next in a short, bright fade
  // rather than a long slide through the muddy midpoint.
  float k = smoothstep(0.8, 1.0, fract(phase));
  vec3 col = mix(pick(idx), pick(next), k);
  gl_FragColor = vec4(col, 1.0);
}
