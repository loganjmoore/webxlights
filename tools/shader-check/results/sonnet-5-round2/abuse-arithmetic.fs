/*{
  "DESCRIPTION": "Bold pulsing candy stripes in two colours that sweep sideways",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 4.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.1 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float coord = (RENDERSIZE.y < 2.0) ? uv.x : (uv.x + uv.y);

  float wave = fract(coord * scale - TIME * speed * 0.5);
  float band = smoothstep(0.5 - sharpness, 0.5 + sharpness, wave);

  vec3 col = mix(colorA.rgb, colorB.rgb, band);

  gl_FragColor = vec4(col, 1.0);
}
