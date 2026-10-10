/*{
  "DESCRIPTION": "Liquid marbling: the palette colours folded into each other in slow, continuous flow, bright everywhere",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.9, 0.1, 0.45, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.25, 0.2, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.7, 0.35, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "warp", "TYPE": "float", "MIN": 0.3, "MAX": 1.2, "DEFAULT": 0.7 }
  ]
}*/
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Three octaves: the marbling comes from the folding, the noise only keeps it from looking
// like sine waves.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 7.1;
    amp *= 0.5;
  }
  return sum / 0.875;
}
// The palette's own brightness: every highlight scales with it, so a palette dimmed for a quiet
// section dims the whole picture rather than leaving white sheen at full strength.
float paletteLevel() {
  vec3 m = max(colorA.rgb, max(colorB.rgb, colorC.rgb));
  return max(m.r, max(m.g, m.b));
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(clamp(aspect, 0.5, 3.0), 1.0) * 1.6;
  if (isLine) p.y = 0.4 * sin(p.x * 1.3);
  float t = mod(TIME * speed, 62.831853);
  // Every time frequency is a whole number of tenths, so the wrap at twenty pi is seamless.
  vec2 o = vec2(cos(t * 0.2), sin(t * 0.3));
  // One slow noise fold first, then three sine folds, each bending the already bent plane.
  // This is what marbling is: a cloth dragged through itself again and again.
  vec2 w = p + warp * (vec2(fbm(p + o), fbm(p + vec2(4.1, 7.3) - o)) - 0.5);
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    w += warp * 0.8 * vec2(sin(w.y * 2.1 + t * 0.3 + k * 1.9), sin(w.x * 1.7 - t * 0.2 + k * 2.7));
  }
  // The folded plane is read as a cycle through the three colours.
  float ph = (w.x + 0.6 * w.y) * 3.0;
  vec3 wt = pow(0.5 + 0.5 * cos(ph - vec3(0.0, 2.0943951, 4.1887902)), vec3(3.0));
  vec3 col = (colorA.rgb * wt.x + colorB.rgb * wt.y + colorC.rgb * wt.z) / (wt.x + wt.y + wt.z);
  // Where two colours meet the mix can sag toward grey or brown: lift it back toward the
  // palette's own brightness. Marbling is lit from inside, never dim.
  float pl = paletteLevel();
  float m = max(col.r, max(col.g, col.b));
  col *= mix(1.0, 0.76 * pl / max(m, 0.2 * pl + 0.0001), 0.85);
  // A slow sheen across the folds gives the liquid depth, and the lightest streaks on its
  // crests keep the whole bed luminous.
  float sheen = 0.5 + 0.5 * sin(w.y * 2.3 + w.x * 1.1 + t * 0.2);
  // Soft pale veins where the folds crowd together.
  float vein = pow(0.5 + 0.5 * cos(ph * 1.5 + 0.9), 5.0);
  col = col * (0.72 + 0.28 * sheen) + pl * (0.1 * sheen * sheen + 0.12 * vein);
  gl_FragColor = vec4(min(col, 1.0), 1.0);
}
