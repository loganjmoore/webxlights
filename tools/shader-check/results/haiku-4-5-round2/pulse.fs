/*{
  "DESCRIPTION": "Lights pulse to a steady beat with color cycling",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "beatFrequency", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float beat = mod(TIME * beatFrequency, 3.0);
  float pulse = sin(TIME * beatFrequency * 3.14159265359) * 0.5 + 0.5;
  pulse = pow(pulse, sharpness);
  
  vec3 color;
  if (beat < 1.0) {
    color = mix(colorA.rgb, colorB.rgb, beat);
  } else if (beat < 2.0) {
    color = mix(colorB.rgb, colorC.rgb, beat - 1.0);
  } else {
    color = mix(colorC.rgb, colorA.rgb, beat - 2.0);
  }
  
  color = mix(vec3(0.1), color, pulse);
  
  gl_FragColor = vec4(color, 1.0);
}
