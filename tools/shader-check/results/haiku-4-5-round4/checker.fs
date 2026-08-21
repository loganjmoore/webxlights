/*{
  "DESCRIPTION": "Two-color checkerboard sliding sideways across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 16.0, "DEFAULT": 4.0 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  vec2 checkUv = uv * scale;
  checkUv.x += TIME * speed;
  
  float checkX = mod(floor(checkUv.x), 2.0);
  float checkY = mod(floor(checkUv.y), 2.0);
  
  float checker = mod(checkX + checkY, 2.0);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, checker);
  
  gl_FragColor = vec4(color, 1.0);
}
