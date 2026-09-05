/*{
  "DESCRIPTION": "Raindrops landing on still water, each one sending out a ring of ripples",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.5, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.9, 0.98, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "drops", "TYPE": "float", "MIN": 1.0, "MAX": 4.0, "DEFAULT": 3.0 }
  ]
}*/
float hash(float n) {
  return fract(sin(n * 91.7) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0);
  // 100 * 0.5 is whole: a drop lands every two seconds per slot, wrapping cleanly.
  float t = mod(TIME * speed, 100.0) * 0.5;
  float ripple = 0.0;
  // Up to four drops in flight, staggered, each landing somewhere new each time.
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    if (fi >= drops) break;
    float slot = t + fi / 4.0;
    float cycle = floor(slot);
    float age = fract(slot);
    float h = hash(cycle * 5.0 + fi);
    vec2 centre = isLine ? vec2((h - 0.5) * min(aspect, 3.0) * 0.9, 0.0) : vec2((h - 0.5) * 1.3, (hash(cycle * 11.0 + fi) - 0.5) * 0.9);
    float d = length(p - centre);
    // Two rings chasing out from the drop, fading as they spread.
    float r = age * 0.7;
    float rings = smoothstep(0.06, 0.0, abs(d - r)) + 0.6 * smoothstep(0.05, 0.0, abs(d - r * 0.6));
    ripple = max(ripple, rings * (1.0 - age));
  }
  // Still water: a deep colour with a soft, slowly moving sheen so it reads as water, not black.
  float sheen = 0.35 + 0.15 * sin(p.x * 3.0 + mod(TIME * speed, 62.831853) * 0.4) * sin(p.y * 4.0 + 1.0);
  vec3 col = colorA.rgb * sheen;
  col = mix(col, colorB.rgb, ripple);
  gl_FragColor = vec4(col, 1.0);
}
