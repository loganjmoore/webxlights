/*{
  "DESCRIPTION": "Alternating red and green bands sweeping across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float band = step(fract((uv.x + TIME * speed * 0.25) * scale), 0.5);
  gl_FragColor = vec4(mix(colorA.rgb, colorB.rgb, band), 1.0);
}
