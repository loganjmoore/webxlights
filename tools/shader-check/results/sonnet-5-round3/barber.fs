/*{
  "DESCRIPTION": "Diagonal stripes scroll continuously like a spinning barber pole",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripes", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 5.0 },
    { "NAME": "diagonal", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  bool isFlat = RENDERSIZE.y < 2.0;

  float diag = isFlat ? 0.0 : diagonal;

  float pos = uv.x + diag * uv.y;

  float scroll = pos * stripes - TIME * speed * 1.5;

  float band = step(0.5, fract(scroll));

  vec3 col = mix(colorA.rgb, colorB.rgb, band);

  gl_FragColor = vec4(col, 1.0);
}
