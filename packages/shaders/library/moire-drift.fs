/*{
  "DESCRIPTION": "Two patterns sliding over each other making slow moire bands roll across the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.9, 0.6, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.9, 0.2, 0.8, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "lines", "TYPE": "float", "MIN": 2.0, "MAX": 6.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float t = mod(TIME * speed, 62.831853);
  float x = uv.x * min(aspect, 3.0);
  float y = isLine ? 0.0 : uv.y;
  // Two line gratings, the second slightly finer and turning, so their beat rolls across the
  // display as slow wide bands. The gratings themselves stay coarse enough for real bulbs.
  float g1 = sin((x + y * 0.2) * lines * 6.2831853 + t * 0.6);
  float g2 = sin((x * cos(t * 0.1) * 1.1 + y * (0.2 + 0.3 * sin(t * 0.2))) * lines * 6.2831853 - t * 0.4);
  float beat = g1 * g2;
  // The beat's bright bands take one colour, its dark bands the other: flat, with soft edges.
  float band = smoothstep(-0.35, 0.35, beat);
  vec3 col = mix(colorB.rgb, colorA.rgb, band);
  // The dark bands are darker as well as the other colour, so the roll has depth.
  col *= 0.55 + 0.45 * band;
  // The gratings show through faintly, which is what makes it a moire and not a stripe.
  float texture = 0.88 + 0.12 * (0.5 + 0.5 * g1);
  gl_FragColor = vec4(col * texture, 1.0);
}
