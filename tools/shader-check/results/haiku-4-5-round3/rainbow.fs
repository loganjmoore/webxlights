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
  
  float sweep = mod(uv.x - TIME * speed * 0.5 + uv.y * width, 1.0);
  
  vec3 rgb;
  if (sweep < 0.166667) {
    rgb = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.5, 0.0), fract(sweep * 6.0));
  } else if (sweep < 0.333333) {
    rgb = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 1.0, 0.0), fract(sweep * 6.0));
  } else if (sweep < 0.5) {
    rgb = mix(vec3(1.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), fract(sweep * 6.0));
  } else if (sweep < 0.666667) {
    rgb = mix(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), fract(sweep * 6.0));
  } else if (sweep < 0.833333) {
    rgb = mix(vec3(0.0, 0.0, 1.0), vec3(0.75, 0.0, 1.0), fract(sweep * 6.0));
  } else {
    rgb = mix(vec3(0.75, 0.0, 1.0), vec3(1.0, 0.0, 0.0), fract(sweep * 6.0));
  }
  
  gl_FragColor = vec4(rgb, 1.0);
}
