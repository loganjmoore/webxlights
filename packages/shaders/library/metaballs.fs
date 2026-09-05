/*{
  "DESCRIPTION": "Big soft blobs drifting and merging into each other like a lava lamp",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "size", "TYPE": "float", "MIN": 0.1, "MAX": 0.5, "DEFAULT": 0.22 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // Capped so a 60-wide line is a few units across, not sixty.
  float ax = min(aspect, 3.0);
  vec2 p = (uv - 0.5) * vec2(ax, 1.0);
  float t = mod(TIME * speed, 62.831853);
  // Four blobs on their own slow figures; every frequency is a whole tenth so the wrap is clean.
  vec2 b0 = vec2(sin(t * 0.6), cos(t * 0.8)) * 0.3;
  vec2 b1 = vec2(cos(t * 1.0 + 1.0), sin(t * 0.4 + 2.0)) * 0.32;
  vec2 b2 = vec2(sin(t * 0.8 + 3.0), sin(t * 1.2 + 1.0)) * 0.28;
  vec2 b3 = vec2(cos(t * 0.4 + 2.0), cos(t * 1.0)) * 0.3;
  if (isLine) {
    // On a line the blobs sit on it: only their x matters, or they would miss it entirely.
    b0.y = 0.0; b1.y = 0.0; b2.y = 0.0; b3.y = 0.0;
    b0.x *= ax; b1.x *= ax; b2.x *= ax; b3.x *= ax;
  }
  float s = size * size;
  float field = s / max(dot(p - b0, p - b0), 0.0004)
              + s / max(dot(p - b1, p - b1), 0.0004)
              + s / max(dot(p - b2, p - b2), 0.0004)
              + s / max(dot(p - b3, p - b3), 0.0004);
  // Three flat zones - dark, body, hot core - with narrow edges so no two colours ever mix into mud.
  float body = smoothstep(0.85, 1.15, field);
  float core = smoothstep(2.4, 3.2, field);
  vec3 col = colorA.rgb * body;
  col = mix(col, colorB.rgb, core);
  gl_FragColor = vec4(col, 1.0);
}
