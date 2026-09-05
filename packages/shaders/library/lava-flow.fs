/*{
  "DESCRIPTION": "Molten lava creeping downhill, bright orange cracks in a dark crust",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.35, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 5.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0) * scale;
  if (isLine) p.y = 0.3 * sin(p.x * 1.1);
  float t = mod(TIME * speed, 62.831853);
  // The flow creeps downhill: everything drifts along -y. Whole tenths, so the wrap is seamless.
  float y = p.y + t * 0.2;
  float x = p.x;
  // Two cell-like fields; the cracks are where they cross zero, the crust is everywhere else.
  float f1 = sin(x * 1.9 + sin(y * 1.3) * 1.5 + t * 0.2);
  float f2 = sin(y * 2.3 + sin(x * 1.7 + t * 0.3) * 1.5);
  // Wider cracks on a line, where a thin one is two bulbs at opposite brightness.
  float crack = 1.0 - smoothstep(0.0, isLine ? 0.7 : 0.35, abs(f1 * f2));
  // Molten pools where both fields are strongly positive: hot cores.
  float pool = smoothstep(0.5, 0.9, f1 * f2);
  // The crust glows dull orange through - dark, but never off.
  vec3 col = colorA.rgb * (0.2 + 0.8 * max(crack, pool));
  col = mix(col, colorB.rgb, pool * 0.9);
  gl_FragColor = vec4(col, 1.0);
}
