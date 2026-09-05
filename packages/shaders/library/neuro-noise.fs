/*{
  "DESCRIPTION": "An organic network of connected glowing filaments, flowing and branching slowly",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 0.9, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 5.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0) * scale;
  if (isLine) p.y = 0.4 * sin(p.x * 1.2);
  float t = mod(TIME * speed, 62.831853);
  // Two slowly warping fields; a filament is where either crosses zero, a node where both do.
  vec2 q = p + vec2(sin(p.y * 1.3 + t * 0.4), cos(p.x * 1.1 - t * 0.3)) * 0.5;
  float f1 = sin(q.x * 1.9 + sin(q.y * 1.4 + t * 0.2) * 1.2);
  float f2 = sin(q.y * 1.7 - sin(q.x * 1.6 - t * 0.3) * 1.2);
  float w = isLine ? 0.55 : 0.42;
  float line1 = 1.0 - smoothstep(0.0, w, abs(f1));
  float line2 = 1.0 - smoothstep(0.0, w, abs(f2));
  float filament = max(line1, line2);
  float node = line1 * line2;
  // A pulse travels along the network, so it flows rather than sits.
  float pulse = 0.6 + 0.4 * sin(f1 * 3.0 + f2 * 2.0 - t * 3.0);
  // The space between filaments is deep, not off: a faint wash of the same colour.
  vec3 col = colorA.rgb * (0.15 + 0.85 * filament * pulse);
  col = mix(col, colorB.rgb, node * 0.9);
  gl_FragColor = vec4(col, 1.0);
}
