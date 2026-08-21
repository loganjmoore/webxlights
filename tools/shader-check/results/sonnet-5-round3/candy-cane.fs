/*{
  "DESCRIPTION": "Diagonal scrolling candy cane stripes in two colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 5.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.1 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float diag;
  if (RENDERSIZE.y < 2.0) {
    diag = uv.x;
  } else {
    diag = uv.x + uv.y;
  }

  float stripes = diag * scale - TIME * speed;
  float band = fract(stripes);

  float edge = clamp(sharpness, 0.01, 0.5);
  float mask = smoothstep(0.5 - edge, 0.5 + edge, band);

  vec3 col = mix(colorA.rgb, colorB.rgb, mask);
  gl_FragColor = vec4(col, 1.0);
}
