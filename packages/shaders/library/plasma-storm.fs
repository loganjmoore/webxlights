/*{
  "DESCRIPTION": "A swirling plasma storm with bright cores and deep space between them",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.6, 0.05, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 6.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // Aspect-corrected, but capped: a 60-wide line would otherwise be 60 units across and the
  // swirl would be finer than the bulbs.
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0) * scale;
  if (isLine) p.y = 0.35 * sin(p.x * 1.5);
  // Every frequency is a whole number of tenths, so the wrap at 20 pi is seamless.
  float t = mod(TIME * speed, 62.831853);
  float v = sin(p.x * 1.7 + t * 1.1);
  v += sin(p.y * 2.3 - t * 0.9);
  v += sin((p.x + p.y) * 1.3 + t * 0.7);
  v += sin(length(p + vec2(sin(t * 0.5), cos(t * 0.6))) * 2.1 - t * 1.3);
  v = 0.5 + v * 0.125;
  // Three flat zones - dark space, the body colour, the hot core - with narrow edges between
  // them, instead of a wide gradient that would pass through grey.
  float body = smoothstep(0.36, 0.48, v);
  float core = smoothstep(0.66, 0.76, v);
  vec3 col = colorA.rgb * body;
  col = mix(col, colorB.rgb, core);
  gl_FragColor = vec4(col, 1.0);
}
