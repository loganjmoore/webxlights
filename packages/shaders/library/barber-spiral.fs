/*{
  "DESCRIPTION": "A barber pole of bold red and white diagonals turning steadily",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.05, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripes", "TYPE": "float", "MIN": 2.0, "MAX": 10.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // 100 * 0.5 is whole, so the turn never jumps when the clock wraps.
  float t = mod(TIME * speed, 100.0);
  // A pole is a cylinder seen from the side: the stripes are steep diagonals that travel
  // upward, and the shading across x is what makes it round rather than flat.
  float d = isLine ? uv.x : uv.x * min(aspect, 2.0) * 0.5 + uv.y;
  float v = fract(d * stripes - t * 0.5);
  float s = abs(v - 0.5) * 2.0;
  float aa = 2.0 * stripes / max(RENDERSIZE.x, 8.0);
  float band = smoothstep(0.5 + aa, 0.5 - aa, s);
  vec3 col = mix(colorB.rgb, colorA.rgb, band);
  // Rounder: brighter down the middle of the pole, darker at its edges. Never below 0.6.
  float round = isLine ? 1.0 : 0.6 + 0.4 * sin(uv.x * 3.14159);
  gl_FragColor = vec4(col * round, 1.0);
}
