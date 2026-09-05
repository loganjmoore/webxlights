/*{
  "DESCRIPTION": "Long ocean swells rolling steadily past, deep blue with bright crests",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.05, 0.25, 0.9, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.8, 0.95, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "swells", "TYPE": "float", "MIN": 1.0, "MAX": 5.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float t = mod(TIME * speed, 62.831853);
  // The swell travels along x; a second, slower wave across it stops the crests being ruler
  // straight. Whole tenths, so the twenty-pi wrap is seamless.
  float y = isLine ? 0.5 : uv.y;
  float phase = uv.x * swells * 6.2831853 - t * 1.0 + sin(y * 4.0 + t * 0.3) * 0.6;
  float swell = 0.5 + 0.5 * sin(phase);
  // The water is deep blue everywhere, brighter on the face of each swell; the crest itself is
  // a narrow band of foam, flat, not a blend.
  float face = 0.45 + 0.55 * swell;
  float crest = smoothstep(0.86, 0.96, swell);
  vec3 col = colorA.rgb * face;
  col = mix(col, colorB.rgb, crest);
  gl_FragColor = vec4(col, 1.0);
}
