/*{
  "DESCRIPTION": "Glowing embers rising slowly from a fire and fading as they go up",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.3, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "embers", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.85 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  // Embers rise; on a line they drift along it. Swap the axes and the same code runs.
  vec2 size = isLine ? RENDERSIZE.yx : RENDERSIZE;
  vec2 px = (isLine ? uv.yx : uv) * size;
  float t = mod(TIME * speed, 100.0);
  float scale = max(1.0, min(size.x, size.y) / 32.0);
  float colW = 3.0 * scale;
  float cols = max(1.0, floor(size.x / colW));
  float ember = 0.0;
  float hot = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float c = floor(px.x / (size.x / cols));
    float h = hash(vec2(c, fl));
    if (h > embers) continue;
    float rate = 0.3 + 0.1 * floor(hash(vec2(c + 5.0, fl)) * 3.0);
    // Rising, wandering a little, and dimming with height - an ember goes out as it climbs.
    float fy = fract(h * 3.0 + fl * 0.5 + t * rate);
    float cx = (c + 0.5) * (size.x / cols) + sin(fy * 9.42 + h * 6.28) * 1.2 * scale;
    float d = length(px - vec2(cx, fy * size.y));
    float glow = smoothstep(2.6 * scale, 0.4 * scale, d) * (1.0 - fy * 0.6);
    ember = max(ember, glow);
    hot = max(hot, glow * step(fy, 0.5));
  }
  // The fire at the bottom, where the embers come from: a warm floor that never goes out.
  float floorGlow = isLine ? 0.3 : 0.6 * (1.0 - smoothstep(0.0, 0.22, uv.y)) + 0.1;
  vec3 col = colorA.rgb * max(floorGlow, ember);
  col = mix(col, colorB.rgb, max(hot, ember * 0.5));
  gl_FragColor = vec4(col, 1.0);
}
