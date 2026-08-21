/*{
  "DESCRIPTION": "Rainbow colors sweep horizontally across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float sweep = mod(uv.x + TIME * speed * 0.5 - uv.y * width, 1.0);
  
  vec3 col;
  if (sweep < 0.166666) {
    col = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.5, 0.0), sweep * 6.0);
  } else if (sweep < 0.333333) {
    col = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 1.0, 0.0), (sweep - 0.166666) * 6.0);
  } else if (sweep < 0.5) {
    col = mix(vec3(1.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), (sweep - 0.333333) * 6.0);
  } else if (sweep < 0.666666) {
    col = mix(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), (sweep - 0.5) * 6.0);
  } else if (sweep < 0.833333) {
    col = mix(vec3(0.0, 0.0, 1.0), vec3(0.75, 0.0, 1.0), (sweep - 0.666666) * 6.0);
  } else {
    col = mix(vec3(0.75, 0.0, 1.0), vec3(1.0, 0.0, 0.0), (sweep - 0.833333) * 6.0);
  }
  
  gl_FragColor = vec4(col, 1.0);
}
