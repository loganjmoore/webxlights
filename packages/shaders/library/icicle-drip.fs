/*{
  "DESCRIPTION": "Icicles hanging down with a bright drop occasionally running to the tip and falling",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.5, 0.8, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "icicleWidth", "TYPE": "float", "MIN": 2.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  // On a line the icicles hang "along" it: every few bulbs is an icicle, and drops run along.
  vec2 size = isLine ? RENDERSIZE.yx : RENDERSIZE;
  vec2 px = (isLine ? uv.yx : uv) * size;
  float t = mod(TIME * speed, 100.0);
  float scale = max(1.0, min(size.x, size.y) / 32.0);
  float w = icicleWidth * scale;
  float c = floor(px.x / w);
  float h = hash(vec2(c, 1.0));
  // Each icicle has its own length, hanging from the top; a rounded taper.
  float len = (0.45 + 0.5 * h) * size.y;
  float fromTop = size.y - px.y;
  float within = (px.x - c * w) / w;
  float taper = 1.0 - fromTop / len;
  float body = step(fromTop, len) * step(abs(within - 0.5) * 2.0, 0.6 + 0.4 * taper);
  // Ice is bright at the top and fades toward the tip, never dark.
  float ice = body * (0.45 + 0.4 * taper);
  // The drop: one per icicle, every few seconds, running down and falling off the tip.
  float rate = 0.1 + 0.1 * floor(hash(vec2(c + 3.0, 2.0)) * 2.0);
  float phase = fract(t * rate + h);
  float dropY = phase * 1.6 * len;
  float drop = smoothstep(1.6 * scale, 0.3 * scale, length(vec2((within - 0.5) * w, fromTop - dropY))) * step(phase, 0.75);
  vec3 col = colorA.rgb * ice;
  col = mix(col, colorB.rgb, drop);
  gl_FragColor = vec4(col, 1.0);
}
