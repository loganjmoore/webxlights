/*{
  "DESCRIPTION": "Random sparkles twinkle over a solid background colour",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.7, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.8, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "sparkleSize", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 8.0 }
  ]
}*/

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  // build a small grid of sparkle cells across the display
  vec2 gridSize = vec2(max(sparkleSize, 1.0), max(sparkleSize * (RENDERSIZE.y / max(RENDERSIZE.x, 1.0)), 1.0));
  if (RENDERSIZE.y < 2.0) {
    gridSize = vec2(max(sparkleSize, 1.0), 1.0);
  }

  vec2 cell = floor(uv * gridSize);

  // give each cell a random phase and random on/off frame so sparkles pop independently
  float randPhase = hash(cell);
  float twinklePeriod = 0.6 + randPhase * 1.4;
  float t = TIME * speed * 1.5 + randPhase * 10.0;

  float cycle = fract(t / max(twinklePeriod, 0.001));
  float pulse = smoothstep(0.0, 0.15, cycle) * smoothstep(1.0, 0.85, cycle);

  // random chance this cell participates at all, controlled by density
  float isActive = step(1.0 - density, hash(cell + 17.0));

  float sparkle = pulse * isActive;

  vec3 col = mix(colorA.rgb, colorB.rgb, sparkle);
  gl_FragColor = vec4(col, 1.0);
}
