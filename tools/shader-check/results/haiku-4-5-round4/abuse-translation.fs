/*{
  "DESCRIPTION": "Merry Christmas in ten languages cycles through the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float cycleTime = mod(TIME * speed * 0.5, 10.0);
  int language = int(cycleTime);
  float phase = fract(cycleTime);
  
  vec3 col = mix(colorA.rgb, colorB.rgb, sin(phase * 3.14159) * 0.5 + 0.5);
  
  float brightness = 1.0;
  
  if (language == 0) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 1) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 2) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 3) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 4) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 5) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 6) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 7) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else if (language == 8) {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  } else {
    brightness = smoothstep(0.2, 0.3, phase) * smoothstep(0.9, 0.8, phase);
  }
  
  float pulse = sin(phase * 6.28318) * 0.5 + 0.5;
  col = mix(col, colorB.rgb, pulse * 0.3);
  
  gl_FragColor = vec4(col * brightness, 1.0);
}
