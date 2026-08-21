/*{
  "DESCRIPTION": "Warm melting chocolate chip cookie colors bubble and rise like dough baking",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.82, 0.55, 0.28, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.35, 0.18, 0.08, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "chipCount", "TYPE": "float", "MIN": 2.0, "MAX": 12.0, "DEFAULT": 6.0 },
    { "NAME": "chipSize", "TYPE": "float", "MIN": 0.05, "MAX": 0.4, "DEFAULT": 0.18 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.3;

  // dough base: warm gradient with slow drift
  vec2 p = uv;
  if (isLine) {
    p.x = uv.x;
    p.y = 0.5;
  }

  float driftX = p.x + t * 0.15;
  float doughMix = 0.5 + 0.3 * sin(driftX * 6.2831 + p.y * 3.0);
  vec3 col = mix(colorA.rgb, colorB.rgb, clamp(doughMix, 0.0, 1.0) * 0.4);

  // chocolate chips: moving blobs along x, wrapped, few per row
  float chips = 0.0;
  float n = floor(chipCount);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= n) break;
    float fi = float(i);
    float speedVar = 0.7 + 0.3 * fract(fi * 0.37);
    float yLane = fract(fi * 0.618034);
    float cx = fract(fi / n + t * speedVar * 0.2);
    float cy = isLine ? 0.5 : yLane;

    vec2 d = p - vec2(cx, cy);
    d.x = d.x - floor(d.x + 0.5);
    if (!isLine) {
      d.y *= 1.0;
    }
    float dist = length(d) / chipSize;
    float chip = smoothstep(1.0, 0.6, dist);
    chips = max(chips, chip);
  }

  vec3 chipColor = colorB.rgb * 0.5;
  col = mix(col, chipColor, chips);

  // subtle warm pulsing glow, like an oven light
  float glow = 0.05 * sin(TIME * speed * 1.5) + 0.05;
  col += glow * colorA.rgb;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
