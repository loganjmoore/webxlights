/*{
  "DESCRIPTION": "Warm cookie-dough waves studded with twinkling chocolate chip sparkles",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "doughColor", "TYPE": "color", "DEFAULT": [0.85, 0.55, 0.25, 1.0] },
    { "NAME": "chipColor", "TYPE": "color", "DEFAULT": [0.35, 0.15, 0.05, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "chipCount", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "sparkle", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  float x = isFlat ? uv.x : uv.x;
  float t = TIME * speed * 0.3;

  // baked dough color warmth wave, moves along x always
  float warm = 0.5 + 0.5 * sin((x * 6.28318) + t * 6.28318);
  vec3 baseCol = mix(doughColor.rgb * 0.8, doughColor.rgb * 1.15, warm);

  // chocolate chips: repeating cells along x, offset per row via y for tall models
  float n = floor(chipCount);
  float cellX = fract(x * n - t * 2.0);
  float cellIndex = floor(x * n - t * 2.0);

  // pseudo-random offset per chip so they don't line up
  float rnd = fract(sin(cellIndex * 12.9898 + (isFlat ? 0.0 : uv.y * 78.233)) * 43758.5453);
  float chipCenterX = 0.5 + (rnd - 0.5) * 0.6;
  float chipRadius = 0.22 + rnd * 0.08;

  float dx = cellX - chipCenterX;
  float dy = isFlat ? 0.0 : (uv.y - (0.3 + rnd * 0.4));
  float dist = length(vec2(dx, dy * 2.0));

  float chipMask = 1.0 - smoothstep(chipRadius * 0.7, chipRadius, dist);

  vec3 col = mix(baseCol, chipColor.rgb, chipMask);

  // sparkle twinkle on chips
  float twinkle = 0.5 + 0.5 * sin(TIME * (3.0 + rnd * 5.0) + rnd * 20.0);
  float sparkleAmt = chipMask * twinkle * sparkle;
  col += sparkleAmt * vec3(1.0, 0.9, 0.6) * 0.5;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
