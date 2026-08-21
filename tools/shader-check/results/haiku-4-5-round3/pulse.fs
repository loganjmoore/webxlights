/*{
  "DESCRIPTION": "Lights pulse in rhythm to a steady beat",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float beat = sin(TIME * speed * 3.14159) * 0.5 + 0.5;
  float pulse = pow(beat, sharpness);
  vec3 color = mix(colorA.rgb, colorB.rgb, uv.x);
  gl_FragColor = vec4(color * pulse, 1.0);
}
