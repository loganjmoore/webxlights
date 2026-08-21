/*{
  "DESCRIPTION": "Alternating flashes between two colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  float flashCycle = mod(TIME * speed, 2.0);
  float flash = step(1.0, flashCycle);
  vec3 color = mix(colorA.rgb, colorB.rgb, flash);
  gl_FragColor = vec4(color, 1.0);
}
