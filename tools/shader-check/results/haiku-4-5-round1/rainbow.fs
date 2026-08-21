/*{
  "DESCRIPTION": "Rainbow colors sweep continuously across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float sweep = fract(uv.x - TIME * speed * 0.5);
  float hue = fract(sweep + uv.y * width);
  
  float h = hue * 6.0;
  float c = 1.0;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  
  vec3 rgb;
  if (h < 1.0) rgb = vec3(c, x, 0.0);
  else if (h < 2.0) rgb = vec3(x, c, 0.0);
  else if (h < 3.0) rgb = vec3(0.0, c, x);
  else if (h < 4.0) rgb = vec3(0.0, x, c);
  else if (h < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  
  gl_FragColor = vec4(rgb, 1.0);
}
