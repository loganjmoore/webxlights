/*{
  "DESCRIPTION": "Smooth color wash that fades between user palette colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  float phase = mod(TIME * speed * 0.5, 3.0);
  vec3 color = vec3(0.0);
  
  if (phase < 1.0) {
    color = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 1.0, phase));
  } else if (phase < 2.0) {
    color = mix(colorB.rgb, colorC.rgb, smoothstep(1.0, 2.0, phase));
  } else {
    color = mix(colorC.rgb, colorA.rgb, smoothstep(2.0, 3.0, phase));
  }
  
  gl_FragColor = vec4(color, 1.0);
}
