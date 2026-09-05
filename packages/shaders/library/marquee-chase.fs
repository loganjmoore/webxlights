/*{
  "DESCRIPTION": "Theatre marquee bulbs chasing around the edge of the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.3, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "spacing", "TYPE": "float", "MIN": 2.0, "MAX": 6.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  vec2 px = uv * RENDERSIZE;
  float w = RENDERSIZE.x;
  float h = RENDERSIZE.y;
  // 100 * 3 is a multiple of the three-bulb cycle, so the chase never skips at the wrap.
  float t = mod(TIME * speed, 100.0);
  float stepIndex = floor(t * 3.0);
  // Position along the edge, going round clockwise from the bottom-left corner. On a line the
  // whole strip is the edge.
  float bw = 1.5;
  float s = -1.0;
  if (isLine) s = px.x;
  else if (px.y < bw) s = px.x;
  else if (px.x > w - bw) s = w + px.y;
  else if (px.y > h - bw) s = w + h + (w - px.x);
  else if (px.x < bw) s = 2.0 * w + h + (h - px.y);
  vec3 col;
  if (s >= 0.0) {
    // Every third bulb lit, and the lit one steps along three times a second. Each lit bulb is
    // a soft glow rather than a hard dot, so neighbouring bulbs never sit at opposite brightness.
    float u = mod(s / spacing - stepIndex, 3.0);
    float dist = min(abs(u - 0.5), 3.0 - abs(u - 0.5));
    float lit = smoothstep(1.4, 0.2, dist);
    col = mix(colorA.rgb * 0.22, colorA.rgb, lit);
  } else {
    // Inside the frame: the sign itself, breathing slowly in the second colour.
    float breathe = 0.55 + 0.25 * sin(mod(TIME * speed, 62.831853) * 0.5);
    vec2 q = (uv - 0.5) * 2.0;
    float inner = 1.0 - smoothstep(0.5, 1.0, max(abs(q.x), abs(q.y)));
    col = colorB.rgb * breathe * (0.55 + 0.45 * inner);
  }
  gl_FragColor = vec4(col, 1.0);
}
