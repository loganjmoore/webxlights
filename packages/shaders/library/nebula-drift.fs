/*{
  "DESCRIPTION": "Deep gas clouds folded into each other, drifting and turning slowly through dark space, with a few soft stars twinkling",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.45, 0.05, 0.95, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.95, 0.08, 0.4, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.8, "MAX": 4.0, "DEFAULT": 1.6 }
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
// Four octaves, each turned a little from the last so the grid never shows. Four is plenty at
// the size of a prop: a fifth would be finer than a bulb.
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
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // Capped wide, and floored narrow so a mega tree still gets cloud across it, not a stripe.
  vec2 p = (uv - 0.5) * vec2(clamp(aspect, 0.5, 3.0), 1.0) * scale;
  if (isLine) p.y = 0.3 * sin(p.x * 0.9);
  float t = mod(TIME * speed, 62.831853);
  // The whole field turns once every twenty pi: a full turn is the identity, so the wrap is
  // seamless. The drift is a pair of slow orbits through the noise, for the same reason.
  float a = t * 0.1;
  p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;
  vec2 o1 = vec2(cos(t * 0.2), sin(t * 0.1));
  vec2 o2 = vec2(sin(t * 0.1 + 1.0), cos(t * 0.2 + 2.0));
  // Two folds of domain warping: the cloud is bent by a cloud that is bent by a cloud.
  vec2 q = vec2(fbm(p + o1), fbm(p + vec2(5.2, 1.3) + o2));
  vec2 r = vec2(fbm(p + 2.5 * q + vec2(1.7, 9.2) + o2), fbm(p + 2.5 * q + vec2(8.3, 2.8) - o1));
  float f = fbm(p + 2.5 * r);
  float dens = smoothstep(0.15, 0.7, f);
  vec3 gas = mix(colorA.rgb, colorB.rgb, smoothstep(0.38, 0.62, q.x));
  // The thickest gas runs hot: the third colour, where the folds pile up.
  gas = mix(gas, colorC.rgb, max(smoothstep(0.5, 0.85, r.y) * dens, 0.75 * smoothstep(0.55, 0.9, f)));
  vec3 col = colorA.rgb * 0.04 + gas * (0.1 + 1.1 * dens * sqrt(dens));
  // Stars sit on the pixel grid, not in the cloud: a star that crept across the bulbs would
  // jump from one to the next. One in eight cells of six pixels has one, held a pixel clear of
  // its cell's edge so no star ever needs its neighbour cell.
  vec2 px = uv * RENDERSIZE;
  vec2 cell = floor(px / 6.0);
  vec2 local = px - cell * 6.0;
  if (hash21(cell + 17.0) < 0.12) {
    vec2 at = 1.5 + floor(vec2(hash21(cell + 3.1), hash21(cell + 8.7)) * 4.0);
    if (isLine) at.y = local.y;
    vec2 d = local - at;
    // Whole tenths again, so the twinkle wraps with everything else.
    float rate = 0.2 + 0.1 * floor(hash21(cell + 5.3) * 5.0);
    float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * rate + hash21(cell + 2.9) * 6.2831853));
    col += mix(vec3(1.0), colorC.rgb, 0.3) * exp(-dot(d, d) * 1.3) * tw;
  }
  gl_FragColor = vec4(min(col, 1.0), 1.0);
}
