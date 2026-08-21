/*{
  "DESCRIPTION": "Lights pulsing to a steady beat with color cycling",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.8 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float beat = TIME * speed;
  float pulse = 0.5 + 0.5 * sin(beat * 6.283185);
  pulse = pow(pulse, 2.0);
  
  float colorCycle = mod(TIME * speed * 0.3, 3.0);
  vec3 color;
  if (colorCycle < 1.0) {
    color = mix(colorA.rgb, colorB.rgb, colorCycle);
  } else if (colorCycle < 2.0) {
    color = mix(colorB.rgb, colorC.rgb, colorCycle - 1.0);
  } else {
    color = mix(colorC.rgb, colorA.rgb, colorCycle - 2.0);
  }
  
  float brightness = mix(1.0 - intensity, 1.0, pulse);
  
  gl_FragColor = vec4(color * brightness, 1.0);
}
