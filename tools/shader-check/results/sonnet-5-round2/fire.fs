/*{
  "DESCRIPTION": "Flickering fire rising from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.15, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 },
    { "NAME": "flicker", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/

float hash1(float n) {
  return fract(sin(n * 43758.5453123) * 43758.5453123);
}

float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float a = hash1(i);
  float b = hash1(i + 1.0);
  return mix(a, b, smoothstep(0.0, 1.0, f));
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  float t = TIME * speed;

  // pick the "rising" axis: y normally, x when the model is a flat roofline
  float riseCoord = isFlat ? uv.x : uv.y;
  float acrossCoord = isFlat ? 0.0 : uv.x;

  // upward scrolling noise field, sampled along the rise axis
  float travel = riseCoord * scale * 4.0 - t * 3.0;
  float n1 = noise1(travel + acrossCoord * scale * 6.0);
  float n2 = noise1(travel * 2.03 + acrossCoord * scale * 9.0 + 17.3);
  float flame = n1 * 0.65 + n2 * 0.35;

  // flicker: cheap time-based jitter, whole-canvas so it reads on 1px-tall rows
  float flick = noise1(t * 6.0 + acrossCoord * 2.0);
  flame += (flick - 0.5) * flicker * 0.6;

  // fire dies out toward the top, is strongest at the base
  float base = 1.0 - riseCoord;
  float intensity = clamp(flame * (0.4 + 0.9 * base) - 0.15, 0.0, 1.0);
  intensity = smoothstep(0.05, 0.95, intensity);

  vec3 col = mix(colorB.rgb, colorA.rgb, intensity);

  // near-black embers at the very base fade to nothing when flame is weak
  float glow = smoothstep(0.0, 0.25, intensity);
  col *= mix(0.35, 1.0, glow);

  gl_FragColor = vec4(col, 1.0);
}
