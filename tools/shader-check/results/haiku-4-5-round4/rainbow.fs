/*{
  "DESCRIPTION": "Rainbow colors sweep across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.3 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float h = mod(uv.x - TIME * speed * 0.5 + uv.y * width, 1.0);
  
  vec3 col = vec3(0.0);
  
  if (h < 0.166666) {
    col = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.5, 0.0), (h / 0.166666));
  } else if (h < 0.333333) {
    col = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 1.0, 0.0), ((h - 0.166666) / 0.166666));
  } else if (h < 0.5) {
    col = mix(vec3(1.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), ((h - 0.333333) / 0.166666));
  } else if (h < 0.666666) {
    col = mix(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), ((h - 0.5) / 0.166666));
  } else if (h < 0.833333) {
    col = mix(vec3(0.0, 0.0, 1.0), vec3(0.7, 0.0, 1.0), ((h - 0.666666) / 0.166666));
  } else {
    col = mix(vec3(0.7, 0.0, 1.0), vec3(1.0, 0.0, 0.0), ((h - 0.833333) / 0.166666));
  }
  
  gl_FragColor = vec4(col, 1.0);
}
