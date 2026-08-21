/*{
  "DESCRIPTION": "Alternating flashes between two colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  float flash = mod(TIME * speed, 2.0);
  vec3 color = mix(colorA.rgb, colorB.rgb, step(1.0, flash));
  gl_FragColor = vec4(color, 1.0);
}
