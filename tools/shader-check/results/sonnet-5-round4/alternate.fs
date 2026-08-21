/*{
  "DESCRIPTION": "Alternating flashes between two colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.01, "MAX": 1.0, "DEFAULT": 0.15 }
  ]
}*/
void main() {
  float cycle = fract(TIME * speed * 0.5);
  float edge0 = 0.5 - sharpness * 0.5;
  float edge1 = 0.5 + sharpness * 0.5;
  float mixAmt = smoothstep(edge0, edge1, cycle) * (1.0 - smoothstep(1.0 - edge1, 1.0 - edge0, cycle));
  vec3 col = mix(colorA.rgb, colorB.rgb, mixAmt);
  gl_FragColor = vec4(col, 1.0);
}
