/*{
  "DESCRIPTION": "Twinkling stars across the lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.6, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.8, 0.9, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 },
    { "NAME": "sparkleSize", "TYPE": "float", "MIN": 0.005, "MAX": 0.5, "DEFAULT": 0.06 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.1, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // aspect correction so stars look consistent on non-square canvases
  vec2 aspect = vec2(RENDERSIZE.x / max(RENDERSIZE.y, 1.0), 1.0);
  vec2 p = uv;
  // If this is a roofline (very short height), drive animation along x only
  bool isLine = (RENDERSIZE.y < 2.0);
  if (isLine) {
    p.y = 0.5;
  }

  const int N = 16;
  float accum = 0.0;
  vec3 colorAccum = vec3(0.0);

  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // deterministic pseudo-random seeds per star
    float seed = fi * 12.9898;
    float hx = fract(sin(seed) * 43758.5453);
    float hy = fract(sin(seed + 78.233) * 96563.123);
    vec2 spos = vec2(hx, hy);
    if (isLine) {
      spos.y = 0.5;
    }
    // spread influenced by density
    spos.x = fract(spos.x * (1.0 + density * 3.0));

    // distance with aspect correction
    vec2 dp = (p - spos) * aspect;
    float d = length(dp);

    // star base shape (soft circular)
    float s = max(0.001, sparkleSize);
    float base = 1.0 - smoothstep(0.0, s, d);

    // twinkle modulation: each star has its own phase and frequency
    float phaseSeed = fract(sin(seed * 0.543 + 0.123) * 43758.5453);
    float freq = 0.5 + density * 2.0;
    float tw = 0.5 + 0.5 * sin(TIME * speed * (1.0 + phaseSeed * freq) * 6.2831853 + phaseSeed * 6.2831853);
    float shimmer = pow(max(0.0, tw), sharpness);

    // small bright core spike for sharp glints
    float spike = pow(max(0.0, 1.0 - d / (s * 0.25)), 8.0) * mix(0.25, 1.0, fract(phaseSeed * 4.0));

    float intensity = base * (0.35 + 0.65 * shimmer) + spike;

    // choose color from palette with slight variation per star
    vec3 c1 = mix(colorA.rgb, colorB.rgb, fract(phaseSeed * 2.1));
    vec3 c = mix(c1, colorC.rgb, smoothstep(0.0, 1.0, fract(phaseSeed * 3.0)));

    colorAccum += c * intensity;
    accum += intensity;
  }

  // normalize to keep overall brightness consistent as density changes
  float norm = max(0.0001, accum / float(N));
  vec3 outCol = colorAccum / norm;

  // clamp and apply mild gamma for vivid look
  outCol = clamp(outCol, 0.0, 1.0);
  outCol = pow(outCol, vec3(0.85));

  gl_FragColor = vec4(outCol, 1.0);
}
