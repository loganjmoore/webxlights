/*{
  "DESCRIPTION": "Alternating flashes between two colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  float phase = mod(TIME * speed, 2.0);
  vec3 color = mix(colorA.rgb, colorB.rgb, step(1.0, phase));
  gl_FragColor = vec4(color, 1.0);
}
