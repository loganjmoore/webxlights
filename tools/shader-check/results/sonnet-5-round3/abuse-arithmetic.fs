/*{
  "DESCRIPTION": "Pulsing candy-cane bands sweep sideways in festive colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 16.0, "DEFAULT": 6.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.1 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float x = RENDERSIZE.y < 2.0 ? uv.x : (uv.x + uv.y * 0.5);
  float phase = fract(x * scale - TIME * speed * 0.5);
  float band = smoothstep(0.5 - sharpness, 0.5 + sharpness, phase);
  vec3 col = mix(colorA.rgb, colorB.rgb, band);
  gl_FragColor = vec4(col, 1.0);
}
