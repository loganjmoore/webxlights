/*{
  "DESCRIPTION": "Big soft snowflakes drifting gently down against a deep winter sky",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.05, 0.12, 0.6, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "flakeSize", "TYPE": "float", "MIN": 1.0, "MAX": 4.0, "DEFAULT": 1.8 },
    { "NAME": "sky", "TYPE": "float", "MIN": 0.1, "MAX": 0.8, "DEFAULT": 0.35 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  // On a line there is no "down", so the flakes drift along it instead: swap the axes and the
  // same code runs, columns become the one row and the fall runs left to right.
  vec2 size = isLine ? RENDERSIZE.yx : RENDERSIZE;
  vec2 px = (isLine ? uv.yx : uv) * size;
  // 100 * 0.1 is whole, so every fall rate below wraps seamlessly.
  float t = mod(TIME * speed, 100.0);
  // Flakes scale with the canvas: a flake is a bulb or two on a matrix, and a proper blob on a
  // screen-sized panel rather than a speck.
  float scale = max(1.0, min(size.x, size.y) / 32.0);
  float colW = 4.0 * scale;
  float cols = max(1.0, floor(size.x / colW));
  float snow = 0.0;
  // Three layers of flakes, each column with its own speed and offset, so it never looks like
  // a repeating pattern.
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float c = floor(px.x / (size.x / cols));
    float h = hash(vec2(c, fl));
    float h2 = hash(vec2(c + 7.0, fl + 3.0));
    float rate = 0.1 + 0.1 * floor(h2 * 3.0);
    // Falling: the y position decreases with time. Each layer is offset a third of the way.
    // Not every column carries a flake in every layer, or it reads as static rather than snow.
    if (hash(vec2(c + 11.0, fl)) < 0.3) continue;
    float fy = fract(h + fl / 2.0 - t * rate);
    float cx = (c + 0.5) * (size.x / cols) + sin(fy * 12.566 + h * 6.28) * 0.6;
    float cy = fy * size.y;
    float d = length(px - vec2(cx, cy));
    snow = max(snow, smoothstep(flakeSize * scale, flakeSize * scale * 0.25, d));
  }
  vec3 col = colorB.rgb * sky;
  col = mix(col, colorA.rgb, snow);
  gl_FragColor = vec4(col, 1.0);
}
