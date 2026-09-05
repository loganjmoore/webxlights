/*{
  "DESCRIPTION": "Blocks of colour cascading down the display in columns at different speeds",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.5, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.6, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.2, 1.0, 0.4, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "columnWidth", "TYPE": "float", "MIN": 2.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
vec3 pick(float i) {
  if (i < 0.5) return colorA.rgb;
  if (i < 1.5) return colorB.rgb;
  return colorC.rgb;
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  // On a line the blocks run along it: swap the axes and the same code runs.
  vec2 size = isLine ? RENDERSIZE.yx : RENDERSIZE;
  vec2 px = (isLine ? uv.yx : uv) * size;
  // 100 * 0.1 is whole, so every fall rate below wraps seamlessly.
  float t = mod(TIME * speed, 100.0);
  float col = floor(px.x / columnWidth);
  // A dim base in the column's colour, so the display is never empty between blocks.
  vec3 out3 = pick(mod(col, 3.0)) * 0.16;
  // Two blocks per column, half a cycle apart, so a column is never empty for long.
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float h = hash(vec2(col, fi));
    float rate = 0.1 + 0.1 * floor(hash(vec2(col + 3.0, fi)) * 4.0);
    float y = fract(h + fi * 0.5 - t * rate);
    // The block's head, and a trail of the same colour fading behind it upward.
    float head = y * size.y;
    float len = 0.4 * size.y;
    float behind = px.y - head;
    float body = step(0.0, behind) * step(behind, len) * (1.0 - smoothstep(0.0, len, behind) * 0.8);
    vec3 c = pick(mod(col + fi, 3.0));
    out3 = max(out3, c * body);
  }
  gl_FragColor = vec4(out3, 1.0);
}
