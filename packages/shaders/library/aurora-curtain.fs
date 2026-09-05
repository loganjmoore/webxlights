/*{
  "DESCRIPTION": "Curtains of aurora rippling slowly across the sky, bright at the base",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 1.0, 0.4, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.6, 0.1, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "folds", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float t = mod(TIME * speed, 62.831853);
  float x = uv.x * folds;
  // The folds of the curtain: a slow large wave with a faster ripple over it. Whole tenths for
  // every frequency, so the twenty-pi wrap is seamless.
  float fold = 0.5 + 0.5 * sin(x * 1.9 + t * 0.7 + sin(x * 0.7 - t * 0.4) * 2.0);
  fold = fold * 0.65 + 0.35 * (0.5 + 0.5 * sin(x * 4.3 - t * 1.1));
  float y = isLine ? 0.3 : uv.y;
  // Brightest at the base, thinning towards the top of the sky.
  float base = 1.0 - smoothstep(0.0, 1.1, y);
  float lum = clamp(fold * 1.3 * (0.35 + base), 0.0, 1.0);
  // Green at the foot, violet higher up - two flat zones with a narrow edge, not a gradient.
  vec3 col = mix(colorA.rgb, colorB.rgb, smoothstep(0.42, 0.62, y + 0.15 * fold));
  gl_FragColor = vec4(col * (0.3 + 0.7 * lum), 1.0);
}
