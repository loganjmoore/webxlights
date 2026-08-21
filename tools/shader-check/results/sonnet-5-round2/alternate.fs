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
  float t = TIME * speed * 2.0;
  float phase = fract(t * 0.5);
  float flash = smoothstep(0.5 - sharpness, 0.5, phase) - smoothstep(1.0 - sharpness, 1.0, phase);
  vec3 col = mix(colorA.rgb, colorB.rgb, flash);
  gl_FragColor = vec4(col, 1.0);
}
