/*{
  "DESCRIPTION": "Iridescent silk folding gently, the hue shifting with the angle of each fold",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 0.9, 0.9, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.9, 0.3, 0.9, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "folds", "TYPE": "float", "MIN": 1.0, "MAX": 5.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0) * folds;
  if (isLine) p.y = 0.0;
  float t = mod(TIME * speed, 62.831853);
  // The cloth: long folds that drift. Whole tenths, so the twenty-pi wrap is seamless.
  float fold = sin(p.x * 1.6 + sin(p.y * 1.1 + t * 0.4) * 1.4 + t * 0.3);
  float fold2 = sin(p.y * 2.2 - t * 0.5 + fold * 0.8);
  // The angle of the fold picks the colour: three flat zones with narrow edges, which is
  // what iridescence looks like on a prop rather than a smear between hues.
  float angle = 0.5 + 0.5 * fold * 0.6 + 0.2 * fold2;
  vec3 col = colorA.rgb;
  col = mix(col, colorB.rgb, smoothstep(0.42, 0.5, angle));
  col = mix(col, colorC.rgb, smoothstep(0.64, 0.72, angle));
  // The fold's crest catches the light; its trough is a little darker, never dark.
  float lit = 0.6 + 0.4 * (0.5 + 0.5 * fold2);
  gl_FragColor = vec4(col * lit, 1.0);
}
