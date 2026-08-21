/*{
  "DESCRIPTION": "All lights pulse together to a steady beat",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float pulse = abs(sin(TIME * speed * 3.14159265));
  pulse = mix(1.0 - intensity, 1.0, pulse);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, 0.5);
  color = color * pulse;
  
  gl_FragColor = vec4(color, 1.0);
}
