/*{
  "DESCRIPTION": "Champagne gold shimmering and rising like bubbles in a glass",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.45, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bubbles", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  // Bubbles rise; on a line they drift along it. Swap the axes and the same code runs.
  vec2 size = isLine ? RENDERSIZE.yx : RENDERSIZE;
  vec2 px = (isLine ? uv.yx : uv) * size;
  // 100 * 0.1 is whole, so every rise rate below wraps seamlessly.
  float t = mod(TIME * speed, 100.0);
  float scale = max(1.0, min(size.x, size.y) / 32.0);
  float colW = 3.0 * scale;
  float cols = max(1.0, floor(size.x / colW));
  float bubble = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float c = floor(px.x / (size.x / cols));
    float h = hash(vec2(c, fl));
    if (h > bubbles) continue;
    float rate = 0.1 + 0.1 * floor(hash(vec2(c + 5.0, fl)) * 3.0);
    // Rising: y increases with time, and wobbles a little on the way up.
    float fy = fract(h * 3.0 + fl * 0.5 + t * rate);
    float cx = (c + 0.5) * (size.x / cols) + sin(fy * 12.566 + h * 6.28) * 0.7 * scale;
    float d = length(px - vec2(cx, fy * size.y));
    bubble = max(bubble, smoothstep(1.4 * scale, 0.3 * scale, d));
  }
  // The glass itself glows: a warm base with a slow shimmer running through it.
  float shimmer = 0.55 + 0.15 * sin(px.y * 0.4 / scale - mod(TIME * speed, 62.831853) * 1.1) * sin(px.x * 0.3 / scale + 1.0);
  float lit = shimmer + (1.0 - shimmer) * bubble;
  gl_FragColor = vec4(colorA.rgb * lit, 1.0);
}
