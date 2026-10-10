/*{
  "DESCRIPTION": "A spiral galaxy turning slowly: arms of dust in the palette colours, a bright core, stars all around",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.35, 0.15, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.95, 0.15, 0.55, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.5, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "arms", "TYPE": "float", "MIN": 2.0, "MAX": 3.0, "DEFAULT": 2.0 }
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
// Four octaves, each turned a little from the last so the grid never shows.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * vnoise(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 7.1;
    amp *= 0.5;
  }
  return sum / 0.9375;
}
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
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
  vec2 p = (uv - 0.5) * vec2(clamp(aspect, 0.5, 3.0), 1.0) * 2.0;
  if (isLine) p.y = 0.0;
  float t = mod(TIME * speed, 62.831853);
  // The galaxy is tipped away from us, so a wide house or matrix gets an oval disc that
  // reaches along it instead of a small circle in the middle. Then it turns. A full turn is
  // the identity, so the wrap at twenty pi is seamless.
  vec2 g = vec2(p.x * 0.6, p.y);
  float a = t * 0.1;
  g = mat2(cos(a), sin(a), -sin(a), cos(a)) * g;
  float r = length(g);
  float n = floor(arms + 0.5);
  // A logarithmic spiral: the angle winds with the log of the radius. Dust bends the arms
  // off the ideal curve so they read as clouds, not as stripes.
  vec2 drift = 0.3 * vec2(cos(t * 0.2), sin(t * 0.3));
  float bend = fbm(g * 2.2 + drift) - 0.5;
  // The nudge keeps atan defined at the very centre of a prop with an odd pixel count, where
  // both arguments would be exactly zero.
  float phase = n * atan(g.y, g.x + 0.0001) + 2.5 * n * log(r + 0.04) + 2.4 * bend;
  float arm = smoothstep(0.1, 0.95, 0.5 + 0.5 * cos(phase));
  float dust = 0.35 + 0.9 * fbm(g * 4.0 - drift * 2.0);
  float reach = exp(-r * 0.75);
  // Inner arms in one colour, outer in another, the hot knots of new stars in the third.
  vec3 body = mix(colorB.rgb, colorA.rgb, smoothstep(0.1, 1.1, r));
  float knots = smoothstep(0.62, 0.9, fbm(g * 7.0 + drift)) * arm;
  vec3 col = body * (0.16 * reach + 1.5 * arm * dust * reach);
  col = mix(col, colorC.rgb, knots * reach * 0.8);
  // The core is the lightest of the three colours, pushed toward white and over-exposed in
  // the middle, with a wide soft halo so the bulge reads even on a coarse prop.
  vec3 core = colorA.rgb;
  float lightest = luma(core);
  if (luma(colorB.rgb) > lightest) { core = colorB.rgb; lightest = luma(core); }
  if (luma(colorC.rgb) > lightest) { core = colorC.rgb; }
  core = mix(core, vec3(paletteLevel()), 0.45);
  col += core * (1.3 * exp(-r * r * 38.0) + 0.38 * exp(-r * 4.5));
  // Stars sit on the pixel grid, not in the galaxy: a star that crept across the bulbs would
  // jump from one to the next. One in eight cells of six pixels has one, held a pixel clear of
  // its cell's edge so no star ever needs its neighbour cell.
  vec2 px = uv * RENDERSIZE;
  vec2 cell = floor(px / 6.0);
  vec2 local = px - cell * 6.0;
  if (hash21(cell + 17.0) < 0.12) {
    vec2 at = 1.5 + floor(vec2(hash21(cell + 3.1), hash21(cell + 8.7)) * 4.0);
    if (isLine) at.y = local.y;
    vec2 d = local - at;
    float rate = 0.2 + 0.1 * floor(hash21(cell + 5.3) * 5.0);
    float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * rate + hash21(cell + 2.9) * 6.2831853));
    col += mix(vec3(paletteLevel()), colorC.rgb, 0.3) * exp(-dot(d, d) * 1.3) * tw;
  }
  gl_FragColor = vec4(min(col, 1.0), 1.0);
}
